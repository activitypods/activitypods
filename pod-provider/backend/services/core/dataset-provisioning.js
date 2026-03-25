const { MoleculerError } = require('moleculer').Errors;
const urlJoin = require('url-join');
const fetch = require('node-fetch');
const CONFIG = require('../../config/config');

const WEBACL_GRAPH = 'http://semapps.org/webacl';
const MIRROR_GRAPH = 'http://semapps.org/mirror';

module.exports = {
  name: 'dataset-provisioning',
  dependencies: ['triplestore'],
  actions: {
    ensureSecureDataset: {
      params: {
        dataset: 'string|min:1'
      },
      async handler(ctx) {
        const { dataset } = ctx.params;

        if (dataset.endsWith('Acl') || dataset.endsWith('Mirror')) {
          throw new MoleculerError(
            `Dataset name "${dataset}" is invalid for provisioning`,
            400,
            'INVALID_DATASET_NAME',
            { dataset }
          );
        }

        const exists = await ctx.call('triplestore.dataset.exist', { dataset });
        if (exists) {
          await this.ensureSemappsNamedGraphs(ctx, dataset);
          return { dataset, created: false, strategy: 'already_exists' };
        }

        try {
          await ctx.call('triplestore.dataset.create', { dataset, secure: true });
          return { dataset, created: true, strategy: 'secure_assembler' };
        } catch (secureErr) {
          if (!this.isAssemblerUploadCompatibilityError(secureErr)) {
            throw new MoleculerError(
              `Secure dataset creation failed for "${dataset}"`,
              500,
              'DATASET_SECURE_CREATE_FAILED',
              { dataset, reason: secureErr.message }
            );
          }

          this.logger.warn(
            `[DatasetProvisioning] Secure assembler upload is not supported by the current Fuseki runtime, switching to admin API strategy for ${dataset}: ${secureErr.message}`
          );

          await this.createDatasetViaFusekiAdmin(dataset);
          await ctx.call('triplestore.dataset.waitForCreation', { dataset });
          await this.ensureSemappsNamedGraphs(ctx, dataset);

          return { dataset, created: true, strategy: 'fuseki_admin_tdb2' };
        }
      }
    }
  },
  methods: {
    isAssemblerUploadCompatibilityError(err) {
      const message = String(err?.message || '').toLowerCase();
      return (
        message.includes('error when creating secure dataset') ||
        message.includes('unsupported media type') ||
        message.includes('text/turtle') ||
        message.includes('assembler')
      );
    },

    async createDatasetViaFusekiAdmin(dataset) {
      const endpoint = urlJoin(CONFIG.SPARQL_ENDPOINT, '$/datasets');
      const auth = Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64');
      const body = new URLSearchParams({ dbName: dataset, dbType: 'tdb2' }).toString();

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      if (![200, 201, 204, 409].includes(response.status)) {
        const details = await response.text();
        throw new MoleculerError(
          `Fuseki admin dataset creation failed for "${dataset}"`,
          500,
          'DATASET_ADMIN_CREATE_FAILED',
          { dataset, status: response.status, details }
        );
      }
    },

    async ensureSemappsNamedGraphs(ctx, dataset) {
      const marker = `urn:semapps:dataset-bootstrap:${dataset}`;
      await ctx.call('triplestore.update', {
        dataset,
        webId: 'system',
        query: `
          INSERT DATA {
            GRAPH <${WEBACL_GRAPH}> {
              <${marker}> <urn:semapps:bootstrapAt> "${new Date().toISOString()}" .
            }
            GRAPH <${MIRROR_GRAPH}> {
              <${marker}> <urn:semapps:bootstrapAt> "${new Date().toISOString()}" .
            }
          }
        `
      });
    }
  }
};