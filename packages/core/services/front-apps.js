const fetch = require('node-fetch');
const urlJoin = require('url-join');
const { ControlledContainerMixin, useFullURI } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'core.front-apps',
  mixins: [ControlledContainerMixin],
  settings: {
    baseUrl: null,
    frontendUrl: null,
    ontologies: [],
    // ControlledContainerMixin settings
    path: '/front-apps',
    acceptedTypes: ['apods:FrontAppRegistration'],
    dereference: [],
    permissions: {},
    newResourcesPermissions: {},
  },
  async started() {
    const res = await fetch('https://data.activitypods.org/trusted-apps', {
      headers: { Accept: 'application/ld+json' }
    });

    if (res.ok) {
      const data = await res.json();
      this.trustedApps = data['ldp:contains'];
    } else {
      throw new Error('Unable to fetch https://data.activitypods.org/trusted-apps');
    }

    // POD provider app
    this.trustedApps.push({
      'apods:domainName': (new URL(this.settings.frontendUrl)).host,
      'apods:handledTypes': ['http://www.w3.org/2006/vcard/ns#Individual', 'https://www.w3.org/ns/activitystreams#Profile', 'http://www.w3.org/2006/vcard/ns#Location'],
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'open-app-endpoint',
        path: '/:username/openApp',
        authorization: false,
        authentication: false,
        aliases: {
          'GET /': 'core.front-apps.open'
        }
      }
    });
  },
  actions: {
    async open(ctx) {
      let { type, uri, mode, username } = ctx.params;

      // If resource type is not provided, guess it from the resource
      if (!type && uri) {
        const results = await ctx.call('triplestore.query', {
          query: `
            SELECT ?type
            WHERE {
              <${uri}> a ?type .
            }
          `,
          dataset: username,
          webId: 'system',
        });

        if (results.length === 0) throw new Error('Resource not found ' + uri);

        // TODO do a search with all types associated with the resource
        type = results[0].type.value;
      }

      if (!type) throw new Error('The type or URI must be provided');

      if (!type.startsWith('http')) type = useFullURI(type, this.settings.ontologies);

      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX apods: <http://activitypods.org/ns/core#>
          SELECT ?domainName
          WHERE {
            ?registration a apods:FrontAppRegistration .
            ?registration apods:preferredForTypes <${type}> .
            ?registration apods:domainName ?domainName .
          }
        `,
        dataset: username,
        webId: 'system',
      });

      if (!results.length) throw new Error(`No app associated with type ${type}`);

      const domainName = results[0].domainName.value;

      const protocol = domainName.includes(':') ? 'http' : 'https';
      if (uri) {
        ctx.meta.$statusCode = 302;
        ctx.meta.$location = `${protocol}://${domainName}/r/?type=${encodeURIComponent(type)}&uri=${encodeURIComponent(uri)}&mode=${mode || 'show'}`;
      } else {
        ctx.meta.$statusCode = 302;
        ctx.meta.$location = `${protocol}://${domainName}/r/?type=${encodeURIComponent(type)}&mode=${mode || 'list'}`;
      }
    },
    async addMissingApps(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        this.logger.info('Adding front apps to dataset ' + dataset + '...');

        for (let app of this.trustedApps) {
          const appUri = urlJoin(this.settings.baseUrl, dataset, 'data', 'front-apps', app['apods:domainName']);
          const exists = await ctx.call('ldp.resource.exist', {
            resourceUri: appUri,
            webId: 'system'
          });

          if (exists) {
            this.logger.info(`${appUri} already exists, skipping...`);
          } else {
            await this.actions.post({
              resource: {
                type: 'apods:FrontAppRegistration',
                'apods:domainName': app['apods:domainName'],
                'apods:preferredForTypes': app['apods:handledTypes'],
                'apods:application': app.id,
              },
              contentType: MIME_TYPES.JSON,
              slug: app['apods:domainName'],
              webId: urlJoin(this.settings.baseUrl, dataset)
            }, { parentCtx: ctx });
            this.logger.info(`${appUri} added!`);
          }
        }
      }
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;
      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });

      await this.waitForContainerCreation(containerUri);

      for (let app of this.trustedApps) {
        // TODO more intelligent handling of preferredForTypes
        // which take into account apps language and priority
        await this.actions.post({
          resource: {
            type: 'apods:FrontAppRegistration',
            'apods:domainName': app['apods:domainName'],
            'apods:preferredForTypes': app['apods:handledTypes'],
            'apods:application': app.id,
          },
          contentType: MIME_TYPES.JSON,
          slug: app['apods:domainName'],
          webId
        }, { parentCtx: ctx });
      }
    }
  }
};
