const fetch = require('node-fetch');
const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'core.front-apps',
  mixins: [ControlledContainerMixin],
  settings: {
    baseUrl: null,
    frontendUrl: null,
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
      'apods:handledTypes': ['vcard:Individual', 'as:Profile', 'vcard:Location'],
    })
  },
  actions: {
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
