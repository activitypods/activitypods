const path = require('node:path');
const fs = require('fs');
const { namedNode, quad } = require('@rdfjs/data-model');
const archiver = require('archiver');
const urlJoin = require('url-join');
const QueueService = require('moleculer-bull');
const { throw403, throw404, throw500 } = require('@semapps/middlewares');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTIVITY_TYPES, PUBLIC_URI } = require('@semapps/activitypub');
const { arrayOf } = require('@semapps/ldp');
const CONFIG = require('../config/config');

let Readable, NTriplesSerializer;
const importAsync = async () => {
  ({ Readable } = await import('readable-stream'));
  ({ NTriplesSerializer } = await import('@rdfjs/formats'));
};
importAsync();

/** @type {import('moleculer').ServiceSchema} */
const ManagementService = {
  name: 'management',
  mixins: [QueueService(CONFIG.QUEUE_SERVICE_URL)],
  dependencies: ['api', 'ldp'],
  settings: {
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    exportDir: './exports',
    retainTmpExportsMs: 5 * 60 * 1000
  },
  async started() {
    if (!this.createJob) {
      this.logger.warn(
        'The moleculer-bull scheduler is not available for the management service. Some feature might not work.'
      );
    }
    const basePath = await this.broker.call('ldp.getBasePath');
    this.broker.call('api.addRoute', {
      route: {
        name: 'management',
        path: path.join(basePath, '/.account/'),
        authentication: true,
        aliases: {
          'POST /:actorUri/export': 'management.exportAccount',
          'DELETE /:actorUri': 'management.deleteAccount'
        }
      }
    });

    if (!fs.existsSync(this.settings.exportDir)) fs.mkdirSync(this.settings.exportDir);
  },
  actions: {
    deleteAccount: {
      params: {
        actorUri: { type: 'string' }
      },
      async handler(ctx) {
        const { actorUri } = ctx.params;
        const { webId } = ctx.meta;

        // Validate that the actor exists.
        const account = await ctx.call('auth.account.findByWebId', { webId: actorUri });
        if (!account) {
          throw404('Actor not found.');
        }

        if (account.group) {
          if (!webId || (webId !== 'system' && webId !== actorUri)) {
            throw403('You are not allowed to delete this actor.');
          }
        } else {
          if (!webId || (webId !== 'system' && webId !== actorUri)) {
            throw403('You are not allowed to delete this actor.');
          }
        }

        const dataset = account.username;

        // Delete account information settings data.
        await ctx.call('auth.account.setTombstone', { webId: actorUri });

        // Delete uploads.
        const uploadsPath = path.join('./uploads/', dataset);
        await fs.promises.rm(uploadsPath, { recursive: true, force: true });

        // Delete backups.
        if (this.broker.registry.hasService('backup')) {
          await ctx.call('backup.deleteDataset', { iKnowWhatImDoing, dataset });
        }

        // Send `Delete` activity to the outside world (so they delete cached data and contact info, etc.).
        const {
          outbox,
          followers,
          'apods:contacts': contacts
        } = await ctx.call('ldp.resource.get', {
          resourceUri: actorUri,
          webId: 'system',
          accept: MIME_TYPES.JSON
        });

        const contactsCollection = await ctx.call('activitypub.collection.get', {
          resourceUri: contacts,
          webId: 'system'
        });

        await ctx.call(
          'activitypub.outbox.post',
          {
            '@context': 'https://www.w3.org/ns/activitystreams',
            collectionUri: outbox,
            type: ACTIVITY_TYPES.DELETE,
            object: actorUri,
            actor: actorUri,
            // TODO: In the future, it would be good to send the activity to as many servers as possible (not just followers).
            //  This is in order to delete cached versions of the account.
            to: [followers, ...arrayOf(contactsCollection.items), PUBLIC_URI]
          },
          // If we don't set this, we will trigger delete of the actor's webId document locally.
          { meta: { doNotProcessObject: true } }
        );

        // Wait for the actual deletion of the dataset until remote actors had time to process `Delete` action.
        // (Because they will need the webId's publicKey to validate the activity's signature.)
        if (this.createJob) {
          this.createJob('deleteDataset', dataset, { dataset }, { delay: 24 * 60 * 60 * 1000 });
          // Delete account after one year. Meanwhile, new users won't be able to register an account under this name.
          this.createJob('deleteAccountInfo', dataset, { webId: actorUri }, { delay: 365 * 24 * 60 * 60 * 1000 });
        } else {
          // Moleculer scheduler not available. The timing here is a tradeoff
          //  between waiting a bit for the delete activity to have gone through
          //  and not relying on the server to be up for forever.
          setTimeout(() => this.deleteDataset(dataset), 1000 * 60 * 5);
        }
      }
    },
    /**
     * Create an export of all actor data (+ backups if requested).
     * Creates a zip archive file with rdf db dump and binaries.
     * Stores it on disk temporarily in the `settings.exportDir`.
     * If a backup exists which is younger than five minutes, the existing backup is served.
     * @returns {Promise<object>} The backup file promise as returned by `fs.promises.readFile`
     */
    exportAccount: {
      params: {
        actorUri: { type: 'string' },
        withBackups: { type: 'boolean', default: false, convert: true },
        withSettings: { type: 'boolean', default: false, convert: true }
      },
      async handler(ctx) {
        const { actorUri, withBackups, withSettings } = ctx.params;

        const webId = ctx.meta.webId || ctx.params.webId;

        if (webId !== 'system' && webId !== actorUri) {
          throw403('You are not allowed to export this actor.');
        }

        // Validate that the actor exists.
        const actor = await ctx.call('auth.account.findByWebId', { webId: actorUri });
        if (!actor?.webId) {
          throw404('Actor not found.');
        }
        const dataset = actor.username;
        const podUrl = await ctx.call('solid-storage.getUrl', { webId: actorUri });

        // If there has been an export less than 5 minutes ago, we won't create a new one.
        // The last one might have stopped during download.
        const recentExport = await this.findRecentExport(dataset, this.settings.retainTmpExportsMs);
        if (recentExport) {
          // Return file stream.
          ctx.meta.$responseType = 'application/zip';
          return fs.promises.readFile(recentExport);
        }

        const serializedQuads = await this.createRdfDump(dataset, webId, withSettings);

        const currentDateStr = new Date().toISOString().replace(/:/g, '-');
        const fileName = path.join(this.settings.exportDir, `${dataset}_${currentDateStr}.zip`);

        // Create zip archiver.
        const archive = archiver('zip', {});
        archive.on('error', function (err) {
          this.logger.error('Error while exporting pod data ', err);
          throw500(err?.message);
        });
        // Create a file to stream archive data to.
        const output = fs.createWriteStream(fileName);
        archive.pipe(output);

        // Add everything rdf into a joined file.
        archive.append(serializedQuads, { name: 'rdf.nq' });

        // Add backup files, if desired and available.
        if (withBackups && ctx.broker.registry.hasService('backup')) {
          /** @type {string[]} */
          const backupFilenames = await ctx.call('backup.listBackupsForDataset', { dataset });
          for (const backupFilename of backupFilenames) {
            archive.file(backupFilename, { name: `backups/${path.basename(backupFilename)}` });
          }
        }

        // Add non-rdf files.
        const uploadsPath = path.join('./uploads/', dataset, 'data');
        (await this.getFilesInDir(uploadsPath)).forEach(relativeFileName => {
          // Reconstruct the URI of the file
          const fileUri = urlJoin(podUrl, relativeFileName);
          // Add file to archive under /non-rdf/<encoded-uri>
          archive.file(path.join(uploadsPath, relativeFileName), { name: `non-rdf/${encodeURIComponent(fileUri)}` });
        });

        // Finish archive creation (closes file).
        await archive.finalize();

        // Schedule cleanup of temporary export file
        if (this.createJob) {
          this.createJob('cleanUpExports', dataset, { offsetMs: 1000 * 60 * 5 }, { delay: 1000 * 60 * 5 });
        } else {
          setTimeout(() => this.deleteOutdatedExports(5 * 60 * 1000));
        }

        // Return file by reading it from fs.
        ctx.meta.$responseType = 'application/zip';
        return fs.promises.readFile(fileName);
      }
    }
  },

  methods: {
    /**
     * Finds the most recent export for a given dataset, if it is within the `offsetMs` range. Otherwise returns `undefined`.
     * @param {string} dataset Dataset name
     * @param {string} offsetMs Offset in milliseconds
     * @returns {string} The most recent export filename, if within offset.
     */
    async findRecentExport(dataset, offsetMs = this.settings.retainTmpExportsMs) {
      const files = fs.readdirSync(this.settings.exportDir);
      files.sort();
      // Regex to grab the date and time part of a file name (colons replaced by hyphens)
      const regex = new RegExp(`${dataset}_([\\d\\-]+)T([\\d\\-.]+)Z?\\.zip`);
      const recentExportFilename = files
        .map(file => [file, regex.exec(file)])
        .filter(([file, matches]) => matches)
        // Reconstruct date objects from file name (hyphens are replaced back to colon in time string)
        .map(([file, matches]) => [file, new Date(`${matches[1]}T${matches[2].replace(/-/g, ':')}Z`)])
        // Only look for exports younger than offset
        .filter(([file, created]) => Date.now() - created < offsetMs)
        .map(([file, created]) => file)
        .at(-1);

      return recentExportFilename && path.join(this.settings.exportDir, recentExportFilename);
    },

    /**
     * Delete all exports in the export directory that are older than the given ms offset.
     * @param {number} offsetMs Offset in milliseconds
     */
    async deleteOutdatedExports(offsetMs) {
      const files = fs.readdirSync(this.settings.exportDir);
      files.sort();
      const regex = /_([\d-]+)T([\d\-.]+)Z?\.zip/;
      files
        .map(file => [file, regex.exec(file)])
        .filter(([file, matches]) => matches)
        .map(([file, matches]) => [file, new Date(`${matches[1]}T${matches[2].replace(/-/g, ':')}Z`)])
        .filter(([file, created]) => Date.now() - created > offsetMs)
        .forEach(([file, created]) => fs.rmSync(path.join(this.settings.exportDir, file), { force: true }));
    },
    /**
     * Get all filenames of a directory and its subdirectories.
     * @param {string} originalDirPath The path to query
     * @param {string} dirPath For recursion only, current query path
     * @param {string[]} filesArr For recursion only, accumulator for files already found
     * @returns {string[]} Filenames relative to the queried directory
     */
    async getFilesInDir(originalDirPath, dirPath = originalDirPath, filesArr = []) {
      if (!fs.existsSync(dirPath)) return [];
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          await this.getFilesInDir(originalDirPath, filePath, filesArr);
        } else {
          filesArr.push(path.relative(originalDirPath, filePath));
        }
      }

      return filesArr;
    },
    async deleteDataset(dataset) {
      // Delete dataset.
      await this.broker.call('triplestore.dataset.delete', { dataset, iKnowWhatImDoing: true });
    },
    /**
     * Create n-quad string from array of rdf-js quads or triples.
     * @param {object[]} quads Array of quads to serialize
     * @returns {string} Serialized n-quads string
     */
    async serializeQuads(quads) {
      const quadStrings = [];
      const serializer = new NTriplesSerializer();
      const nQuadStream = serializer.import(Readable.from(quads));
      nQuadStream.on('data', quadString => {
        quadStrings.push(quadString);
      });
      // Wait until reading stream finished
      await new Promise(resolve => {
        nQuadStream.on('end', () => {
          resolve();
        });
      });
      return quadStrings.join('');
    },
    /**
     * Create n-quads string from dataset and settings dataset of webId.
     * @param {string} dataset Name of db dataset
     * @param {string} webId WebId as registered in the settings
     * @param withSettings
     * @returns {string} n-quads serialized dump of dataset and settings records.
     */
    async createRdfDump(dataset, webId, withSettings = false) {
      const dumpQuery = `SELECT * { { ?s ?p ?o } UNION { GRAPH ?g { ?s ?p ?o } } }`;
      /** @type {object[]} */
      const datasetDump = await this.broker.call('triplestore.query', {
        query: dumpQuery,
        webId: 'system',
        dataset,
        accept: MIME_TYPES.JSON
      });
      const settingsDump = !withSettings
        ? []
        : await this.broker.call('triplestore.query', {
            dataset: this.settings.settingsDataset,
            query: `SELECT * WHERE {
          ?s ?p ?o .
          FILTER EXISTS { ?s <http://semapps.org/ns/core#webId> "${webId}" }
        }`,
            accept: MIME_TYPES.JSON
          });
      // Add settings graph to settings triples
      const settingsGraphNode = namedNode('http://semapps.org/ns/core#settings');
      settingsDump.forEach(record => {
        record.g = settingsGraphNode;
      });
      // Add settings triples to export dataset.
      datasetDump.push(...settingsDump);
      // Convert to rdf-js quads.
      const allQuads = datasetDump.map(q => quad(q.s, q.p, q.o, q.g));
      const serializedRdf = await this.serializeQuads(allQuads);
      return serializedRdf;
    }
  },

  queues: {
    deleteDataset: {
      name: '*',
      async process(job) {
        const { dataset } = job.data;
        job.progress(0);
        await this.deleteDataset(dataset);
        job.progress(100);
      }
    },

    deleteAccountInfo: {
      name: '*',
      async process(job) {
        const { webId } = job.data;
        job.progress(0);
        await this.broker.call('auth.account.deleteByWebId', { webId });
        job.progress(100);
      }
    },

    cleanUpExports: {
      name: '*',
      async process(job) {
        const { offsetMs } = job.data;
        await this.deleteOutdatedExports(offsetMs ?? this.settings.retainTmpExportsMs);
      }
    }
  }
};

module.exports = ManagementService;
