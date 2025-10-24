import path from 'node:path';
import fs from 'fs';
import rdf from '@rdfjs/data-model';
import archiver from 'archiver';
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'mole... Remove this comment to see the full error message
import QueueService from 'moleculer-bull';
import { throw403, throw404, throw500 } from '@semapps/middlewares';
import { MIME_TYPES } from '@semapps/mime-types';
import { ACTIVITY_TYPES, PUBLIC_URI } from '@semapps/activitypub';
import { sanitizeSparqlQuery } from '@semapps/triplestore';
import { arrayOf } from '@semapps/ldp';
import * as CONFIG from '../config/config.ts';
import { ServiceSchema } from 'moleculer';
// @ts-expect-error TS(7034): Variable 'Readable' implicitly has type 'any' in s... Remove this comment to see the full error message
let Readable, NTriplesSerializer;

const importAsync = async () => {
  ({ Readable } = await import('readable-stream'));
  ({ NTriplesSerializer } = await import('@rdfjs/formats'));
};

importAsync();

const ManagementService = {
  name: 'management' as const,
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
        path: path.join(basePath, '/.account'),
        authentication: true,
        aliases: {
          'POST /:username/export': 'management.exportAccount',
          'DELETE /:username': 'management.deleteAccount'
        }
      }
    });

    if (!fs.existsSync(this.settings.exportDir)) fs.mkdirSync(this.settings.exportDir);
  },
  actions: {
    deleteAccount: {
      params: {
        username: { type: 'string' }
      },
      async handler(ctx) {
        const { username } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;

        // Validate that the actor exists.
        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account) throw404('Actor not found');

        // Validate that the authenticated user has the right to delete
        if (webId !== 'system') {
          if (!webId) {
            throw403('You are not allowed to delete this actor.');
          }
          if (account.group && !arrayOf(account.owner).includes(webId)) {
            throw403('You are not allowed to delete this group.');
          }
          if (!account.group && webId !== account.webId) {
            throw403('You are not allowed to delete this actor.');
          }
        }

        // Delete account information settings data.
        await ctx.call('auth.account.setTombstone', { webId: account.webId });

        // Delete uploads.
        const uploadsPath = path.join('./uploads/', username);
        await fs.promises.rm(uploadsPath, { recursive: true, force: true });

        // Delete backups.
        // @ts-expect-error TS(2551): Property 'hasService' does not exist on type 'Serv... Remove this comment to see the full error message
        if (this.broker.registry.hasService('backup')) {
          await ctx.call('backup.deleteDataset', { dataset: username });
        }

        // Send `Delete` activity to the outside world (so they delete cached data and contact info, etc.).
        const actor = await ctx.call('ldp.resource.get', { resourceUri: account.webId, accept: MIME_TYPES.JSON });
        let recipients;

        // Get recipients
        // TODO In the future, it would be good to send the activity to as many servers as possible
        // This is in order to delete cached versions of the account.
        if (account.group) {
          // TODO get the whole list of members and add them as recipients
          recipients = [actor.followers, ...arrayOf(account.owner), PUBLIC_URI];
        } else {
          const contactsCollection = await ctx.call('activitypub.collection.get', {
            resourceUri: actor['apods:contacts'],
            webId: 'system'
          });
          recipients = [actor.followers, ...arrayOf(contactsCollection.items), PUBLIC_URI];
        }

        await ctx.call(
          'activitypub.outbox.post',
          {
            '@context': 'https://www.w3.org/ns/activitystreams',
            collectionUri: actor.outbox,
            type: ACTIVITY_TYPES.DELETE,
            object: actor.id,
            actor: actor.id,
            to: recipients
          },
          {
            meta: {
              webId: actor.id,
              doNotProcessObject: true // If we don't set this, we will trigger delete of the actor's webId document locally.
            }
          }
        );

        // Wait for the actual deletion of the dataset until remote actors had time to process `Delete` action.
        // (Because they will need the webId's publicKey to validate the activity's signature.)
        if (this.createJob) {
          this.createJob('deleteDataset', username, { dataset: username }, { delay: 24 * 60 * 60 * 1000 });
          // Delete account after one year. Meanwhile, new users won't be able to register an account under this name.
          this.createJob('deleteAccountInfo', username, { webId: actor.id }, { delay: 365 * 24 * 60 * 60 * 1000 });
        } else {
          // Moleculer scheduler not available. The timing here is a tradeoff
          //  between waiting a bit for the delete activity to have gone through
          //  and not relying on the server to be up for forever.
          setTimeout(() => this.deleteDataset(username), 1000 * 60 * 5);
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
        username: { type: 'string' },
        withBackups: { type: 'boolean', default: false, convert: true },
        withSettings: { type: 'boolean', default: false, convert: true }
      },
      async handler(ctx) {
        const { username, withBackups, withSettings } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;

        // Validate that the actor exists
        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account) throw404('Actor not found');

        // Validate that the authenticated user has the right to export
        if (webId !== 'system') {
          if (!webId) {
            throw403('You are not allowed to delete this actor.');
          }
          if (account.group && !arrayOf(account.owner).includes(webId)) {
            throw403('You are not allowed to delete this group.');
          }
          if (!account.group && webId !== account.webId) {
            throw403('You are not allowed to delete this actor.');
          }
        }

        const storageUrl = await ctx.call('solid-storage.getBaseUrl', { webId: account.webId });

        // If there has been an export less than 5 minutes ago, we won't create a new one.
        // The last one might have stopped during download.
        const recentExport = await this.findRecentExport(username, this.settings.retainTmpExportsMs);
        if (recentExport) {
          // Return file stream.
          // @ts-expect-error TS(2339): Property '$responseType' does not exist on type '{... Remove this comment to see the full error message
          ctx.meta.$responseType = 'application/zip';
          return fs.promises.readFile(recentExport);
        }

        const serializedQuads = await this.createRdfDump(username, account.webId, withSettings);

        const currentDateStr = new Date().toISOString().replace(/:/g, '-');
        const fileName = path.join(this.settings.exportDir, `${username}_${currentDateStr}.zip`);

        // Create zip archiver.
        const archive = archiver('zip', {});
        archive.on('error', function (err) {
          // @ts-expect-error TS(2683): 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
          this.logger.error('Error while exporting pod data ', err);
          throw500(err?.message);
        });
        // Create a file to stream archive data to.
        const output = fs.createWriteStream(fileName);
        archive.pipe(output);

        // Add everything rdf into a joined file.
        archive.append(serializedQuads, { name: 'rdf.nq' });

        // Add backup files, if desired and available.
        // @ts-expect-error TS(2551): Property 'hasService' does not exist on type 'Serv... Remove this comment to see the full error message
        if (withBackups && this.broker.registry.hasService('backup')) {
          /** @type {string[]} */
          const backupFilenames = await ctx.call('backup.listBackupsForDataset', { dataset: username });
          for (const backupFilename of backupFilenames) {
            archive.file(backupFilename, { name: `backups/${path.basename(backupFilename)}` });
          }
        }

        // Add non-rdf files.
        const uploadsPath = path.join('./uploads/', username, 'data');
        // @ts-expect-error TS(7006): Parameter 'relativeFileName' implicitly has an 'an... Remove this comment to see the full error message
        (await this.getFilesInDir(uploadsPath)).forEach(relativeFileName => {
          // Reconstruct the URI of the file
          const fileUri = urlJoin(storageUrl, relativeFileName);
          // Add file to archive under /non-rdf/<encoded-uri>
          archive.file(path.join(uploadsPath, relativeFileName), { name: `non-rdf/${encodeURIComponent(fileUri)}` });
        });

        // Finish archive creation (closes file).
        await archive.finalize();

        // Schedule cleanup of temporary export file
        if (this.createJob) {
          this.createJob('cleanUpExports', username, { offsetMs: 1000 * 60 * 5 }, { delay: 1000 * 60 * 5 });
        } else {
          setTimeout(() => this.deleteOutdatedExports(5 * 60 * 1000));
        }

        // Return file by reading it from fs.
        // @ts-expect-error TS(2339): Property '$responseType' does not exist on type '{... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2683): 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    async findRecentExport(dataset, offsetMs = this.settings.retainTmpExportsMs) {
      const files = fs.readdirSync(this.settings.exportDir);
      files.sort();
      // Regex to grab the date and time part of a file name (colons replaced by hyphens)
      const regex = new RegExp(`${dataset}_([\\d\\-]+)T([\\d\\-.]+)Z?\\.zip`);
      const recentExportFilename = files
        .map(file => [file, regex.exec(file)])
        .filter(([file, matches]) => matches)
        // Reconstruct date objects from file name (hyphens are replaced back to colon in time string)
        // @ts-expect-error TS(18047): 'matches' is possibly 'null'.
        .map(([file, matches]) => [file, new Date(`${matches[1]}T${matches[2].replace(/-/g, ':')}Z`)])
        // Only look for exports younger than offset
        // @ts-expect-error TS(2363): The right-hand side of an arithmetic operation mus... Remove this comment to see the full error message
        .filter(([file, created]) => Date.now() - created < offsetMs)
        .map(([file, created]) => file)
        .at(-1);

      // @ts-expect-error TS(2345): Argument of type 'string | RegExpExecArray | Date'... Remove this comment to see the full error message
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
        // @ts-expect-error TS(18047): 'matches' is possibly 'null'.
        .map(([file, matches]) => [file, new Date(`${matches[1]}T${matches[2].replace(/-/g, ':')}Z`)])
        // @ts-expect-error TS(2363): The right-hand side of an arithmetic operation mus... Remove this comment to see the full error message
        .filter(([file, created]) => Date.now() - created > offsetMs)
        // @ts-expect-error TS(2345): Argument of type 'string | RegExpExecArray | Date ... Remove this comment to see the full error message
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
      // @ts-expect-error TS(7034): Variable 'quadStrings' implicitly has type 'any[]'... Remove this comment to see the full error message
      const quadStrings = [];
      // @ts-expect-error TS(7005): Variable 'NTriplesSerializer' implicitly has an 'a... Remove this comment to see the full error message
      const serializer = new NTriplesSerializer();
      // @ts-expect-error TS(7005): Variable 'Readable' implicitly has an 'any' type.
      const nQuadStream = serializer.import(Readable.from(quads));
      // @ts-expect-error TS(7006): Parameter 'quadString' implicitly has an 'any' typ... Remove this comment to see the full error message
      nQuadStream.on('data', quadString => {
        quadStrings.push(quadString);
      });
      // Wait until reading stream finished
      await new Promise(resolve => {
        nQuadStream.on('end', () => {
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
      // @ts-expect-error TS(7005): Variable 'quadStrings' implicitly has an 'any[]' t... Remove this comment to see the full error message
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
      /** @type {object[]} */
      const datasetDump = await this.broker.call('triplestore.query', {
        query: `SELECT * { GRAPH ?g { ?s ?p ?o } }`,
        webId: 'system',
        dataset,
        accept: MIME_TYPES.JSON
      });
      const settingsDump = !withSettings
        ? []
        : await this.broker.call('triplestore.query', {
            dataset: this.settings.settingsDataset,
            query: sanitizeSparqlQuery`
              SELECT * WHERE {
                GRAPH ?g {
                  ?s ?p ?o .
                  FILTER EXISTS { ?s <http://semapps.org/ns/core#webId> "${webId}" }
                }
              }
            `,
            accept: MIME_TYPES.JSON
          });
      // Add settings graph to settings triples
      const settingsGraphNode = rdf.namedNode('http://semapps.org/ns/core#settings');
      settingsDump.forEach(record => {
        record.g = settingsGraphNode;
      });
      // Add settings triples to export dataset.
      // @ts-expect-error TS(2339): Property 'push' does not exist on type 'never'.
      datasetDump.push(...settingsDump);

      // Convert to rdf-js quads.
      // @ts-expect-error TS(2339): Property 'map' does not exist on type 'never'.
      const allQuads = datasetDump.map(q => rdf.quad(q.s, q.p, q.o, q.g));
      const serializedRdf = await this.serializeQuads(allQuads);
      return serializedRdf;
    }
  },
  queues: {
    deleteDataset: {
      name: '*',
      // @ts-expect-error TS(7006): Parameter 'job' implicitly has an 'any' type.
      async process(job) {
        const { dataset } = job.data;
        job.progress(0);
        // @ts-expect-error TS(2339): Property 'deleteDataset' does not exist on type '{... Remove this comment to see the full error message
        await this.deleteDataset(dataset);
        job.progress(100);
      }
    },
    deleteAccountInfo: {
      name: '*',
      // @ts-expect-error TS(7006): Parameter 'job' implicitly has an 'any' type.
      async process(job) {
        const { webId } = job.data;
        job.progress(0);
        // @ts-expect-error TS(2339): Property 'broker' does not exist on type '{ name: ... Remove this comment to see the full error message
        await this.broker.call('auth.account.deleteByWebId', { webId });
        job.progress(100);
      }
    },
    cleanUpExports: {
      name: '*',
      // @ts-expect-error TS(7006): Parameter 'job' implicitly has an 'any' type.
      async process(job) {
        const { offsetMs } = job.data;
        // @ts-expect-error TS(2339): Property 'deleteOutdatedExports' does not exist on... Remove this comment to see the full error message
        await this.deleteOutdatedExports(offsetMs ?? this.settings.retainTmpExportsMs);
      }
    }
  }
} satisfies ServiceSchema;

export default ManagementService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ManagementService.name]: typeof ManagementService;
    }
  }
}
