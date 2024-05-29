const { getDatasetFromUri } = require('@semapps/ldp');
const path = require('node:path');
const fs = require('fs');
const archiver = require('archiver');
const urlJoin = require('url-join');
const { throw403, throw404 } = require('@semapps/middlewares');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTIVITY_TYPES, PUBLIC_URI } = require('@semapps/activitypub');

/** @type {import('moleculer').ServiceSchema} */
const ManagementService = {
  name: 'management',
  dependencies: ['api'],
  settings: {
    settingsDataset: 'settings',
    exportDir: './exports'
  },
  async started() {
    if (!this.createJob) {
      this.logger.warn(
        'The moleculer-bull scheduler is not available for the management service. Some feature might not work.'
      );
    }
    await this.broker.call('api.addRoute', {
      route: {
        name: 'management',
        authentication: true,
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

        if (!webId || (webId !== 'system' && getDatasetFromUri(webId) !== dataset)) {
          throw403('You are not allowed to delete this actor.');
        }

        // Validate that the actor exists.
        const { webId: actorUri } = await ctx.call('auth.account.findByUsername', { username: dataset });
        if (!actorUri) {
          throw404('Actor not found.');
        }

        // Delete account information settings data.
        await this.broker.call('auth.account.setTombstone', { webId: actorUri });

        // Delete uploads.
        const uploadsPath = path.join('./uploads/', dataset);
        await fs.promises.rm(uploadsPath, { recursive: true, force: true });

        let skip = true;
        // Delete backups.
        if (this.broker.registry.hasService('backup') && !skip) {
          await this.broker.call('backup.deleteDataset', { iKnowWhatImDoing, dataset });
        }

        // Send `Delete` activity to the outside world (so they delete cached data and contact info, etc.).
        const { outbox } = await ctx.call('ldp.resource.get', {
          resourceUri: actorUri,
          webId: 'system',
          accept: MIME_TYPES.JSON
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
            to: PUBLIC_URI
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
    exportActor: {
      params: {
        actorSlug: { type: 'string' },
        withBackups: { type: 'boolean', default: false }
      },
      async handler(ctx) {
        const { actorSlug: dataset, withBackups } = ctx.params;

        const webId = ctx.meta.webId || ctx.params.webId;

        if (webId !== 'system' && getDatasetFromUri(webId) !== dataset) {
          throw403('You are not allowed to export this actor.');
        }

        // Validate that the actor exists.
        const actor = await ctx.call('auth.account.findByUsername', { username: dataset });
        if (!actor?.webId) {
          throw404('Actor not found.');
        }

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

        const settingsQuads = await ctx
          .call('triplestore.query', {
            query: `SELECT * WHERE {
            ?s ?p ?o .
            FILTER EXISTS { ?s <http://semapps.org/ns/core#webId> <${actorUri}> }
          }`
          })
          .then(tsv => tsv.replace(/.*\n/, '').replace(/\n/g, ' <http://semapps.org/ns/core#settings> .\n'));

        this.logger.info('dump created:', rdfDump.substring(0, 1000), '...', settingsQuads.substring(0, 1000));

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

        // Add everything rdf into a joined file.
        archive.append(rdfDump + '\n' + settingsQuads, { name: 'rdf.nq' });

        // Add backup files, if desired and available.
        if (withBackups && ctx.broker.registry.hasService('backup')) {
          /** @type {string[]} */
          const backupFilenames = await ctx.call('backup.listBackupsForDataset', { dataset });
          for (const backupFilename of backupFilenames) {
            archive.file(backupFilename, { name: `backups/${path.basename(backupFilename)}` });
          }
        }

        // Add non-rdf files to repo
        const uploadsPath = path.join('./uploads/', dataset, 'data');
        (await this.getFiles(uploadsPath)).forEach(relativeFileName => {
          // Reconstruct the URI of the file
          const fileUri = urlJoin(actor.podUri, relativeFileName);
          // Add file to archive under /non-rdf/<encoded-uri>
          archive.file(path.join(uploadsPath, relativeFileName), { name: `non-rdf/${encodeURIComponent(fileUri)}` });
        });

        // Finish archive creation.
        await archive.finalize();
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
    },
    async deleteDataset(dataset) {
      // Delete dataset.
      await this.broker.call('triplestore.dataset.delete', { dataset, iKnowWhatImDoing: true });
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
        await broker.call('auth.account.deleteByWebId', { webId });
        job.progress(100);
      }
    }
  }
};

module.exports = { ManagementService };

// // Delete everything but webId data + keys and dataset (necessary since we send a
// //  `Delete` activity (which gets signed with the publicKey dereferenced by the webId's key).
// await ctx.call('triplestore.upade', {
//   query: `
//   DELETE {?s ?p ?o} WHERE {
//     ?s ?p ?o .
//     FILTER NOT EXISTS {
//       {
//         <${actorUri}> ?p ?o .
//       } UNION {
//         <${actorUri}> <https://w3id.org/security#publicKey> ?s .
//       } UNION {
//         <${actorUri}> <https://w3id.org/security#verificationMethod> ?s .
//       }
//     }
//   }`,
//   webId: 'system',
//   dataset
// });
