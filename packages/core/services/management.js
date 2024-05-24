const { getDatasetFromUri } = require('@semapps/ldp');
const path = require('node:path');
const fs = require('fs');
const archiver = require('archiver');
const urlJoin = require('url-join');
const { throw403, throw404 } = require('@semapps/middlewares');
const { MIME_TYPES } = require('@semapps/mime-types');

/** @type {import('moleculer').ServiceSchema} */
const ManagementService = {
  name: 'management',
  dependencies: ['api'],
  settings: {
    settingsDataset: 'settings',
    exportDir: './exports'
  },
  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'management',
        path: '/.management/actor/:actorSlug',
        aliases: {
          'DELETE /': 'management.deleteActor'
        }
      }
    });
  },
  actions: {
    deleteActor: {
      params: {
        actorSlug: { type: 'string' },
        iKnowWhatImDoing: { type: 'boolean' }
      },
      async handler(ctx) {
        const { actorSlug: dataset, iKnowWhatImDoing } = ctx.params;
        const webId = ctx.meta.webId;
        if (!iKnowWhatImDoing) {
          throw new Error(
            'Please confirm that you know what you are doing and set the `iKnowWhatImDoing` parameter to `true`.'
          );
        }

        if (getDatasetFromUri(webId) !== dataset && webId !== 'system') {
          throw403('You are not allowed to delete this actor.');
        }

        // Validate that the actor exists.
        const { webId: actorUri } = await ctx.call('auth.account.findByUsername', { username: dataset });
        if (!actorUri) {
          throw404('Actor not found.');
        }

        // Delete keys (this will only take effect, if the key store is still in legacy state).
        const deleteKeyPromise = ctx.call('signature.keypair.delete', { actorUri });

        // Delete dataset.
        const delDatasetPromise = ctx.call('triplestore.dataset.delete', { dataset, iKnowWhatImDoing });

        // Delete account information settings data.
        const deleteAccountPromise = ctx.call('auth.account.setTombstone', { webId: actorUri });

        // Delete uploads.
        const uploadsPath = path.join('./uploads/', dataset);
        const delUploadsPromise = fs.promises.rm(uploadsPath, { recursive: true, force: true });

        // Delete backups.
        let delBackupsPromise;
        if (ctx.broker.registry.hasService('backup')) {
          delBackupsPromise = ctx.call('backup.deleteDataset', { iKnowWhatImDoing, dataset });
        }

        // Wait for all delete operations to finish.
        await delDatasetPromise;
        await deleteKeyPromise;
        await deleteAccountPromise;
        await delUploadsPromise;
        await delBackupsPromise;
      }
    },
    exportActor: {
      params: {
        actorSlug: { type: 'string' }
      },
      async handler(ctx) {
        const { actorSlug: dataset } = ctx.params;
        const webId = ctx.meta.webId || ctx.params.webId;

        if (webId !== 'system' && getDatasetFromUri(webId) !== dataset) {
          throw403('You are not allowed to export this actor.');
        }

        // Validate that the actor exists.
        const actor = await ctx.call('auth.account.findByUsername', { username: dataset });
        if (!actor?.webId) {
          throw404('Actor not found.');
        }

        // TODO: Add data from settings dataset.
        const dumpQuery = `SELECT * { { ?s ?p ?o } UNION { GRAPH ?g { ?s ?p ?o } } }`;
        /** @type {string} */
        const rdfDump = await ctx
          .call('triplestore.query', {
            query: dumpQuery,
            webId: 'system',
            dataset,
            // n-quads
            accept: MIME_TYPES.TSV
          })
          // Fuseki doesn't support n-quads, so we convert by removing the first line and add `.` behind each line.
          .then(tsv => tsv.replace(/.*\n/, '').replace(/\n/g, ' .\n'));

        this.logger.info('dump created:', rdfDump.substring(0, 1000));

        const dateTimeString = new Date().toISOString().replace(/:/g, '-');

        // Create a file to stream archive data to.
        if (!fs.existsSync(this.settings.exportDir)) fs.mkdirSync(this.settings.exportDir);
        const output = fs.createWriteStream(path.join(this.settings.exportDir, `${dataset}_${dateTimeString}.zip`));
        const archive = archiver('zip', {
          zlib: { level: 9 } // Sets the compression level.
        });

        // Listeners
        {
          // listen for all archive data to be written
          // 'close' event is fired only when a file descriptor is involved
          output.on('close', function () {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');
          });

          // This event is fired when the data source is drained no matter what was the data source.
          // It is not part of this library but rather from the NodeJS Stream API.
          // @see: https://nodejs.org/api/stream.html#stream_event_end
          output.on('end', function () {
            console.log('Data has been drained');
          });

          // good practice to catch warnings (ie stat failures and other non-blocking errors)
          archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
              // log warning
            } else {
              // throw error
              throw err;
            }
          });

          // good practice to catch this error explicitly
          archive.on('error', function (err) {
            console.error(err);
            // throw err;
          });
        }

        archive.pipe(output);

        archive.append(rdfDump, { name: 'rdf.nq' });

        const uploadsPath = path.join('./uploads/', dataset, 'data');
        (await this.getFiles(uploadsPath)).map(relativeFileName => {
          // Reconstruct the URI of the file
          const fileUri = urlJoin(actor.podUri, relativeFileName);
          // Add file to archive under /non-rdf/<encoded-uri>
          archive.file(path.join(uploadsPath, relativeFileName), { name: `non-rdf/${encodeURIComponent(fileUri)}` });
        });

        // Finish archive creation.
        archive.finalize();
      }
    }
  },

  methods: {
    async getFiles(originalDirPath, dirPath = originalDirPath, filesArr = []) {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          await this.getFiles(originalDirPath, filePath, filesArr);
        } else {
          filesArr.push(path.relative(originalDirPath, filePath));
        }
      }

      return filesArr;
    }
  }
};

module.exports = { ManagementService };
