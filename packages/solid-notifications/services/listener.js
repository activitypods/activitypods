const urlJoin = require('url-join');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const DbService = require('moleculer-db');
const { TripleStoreAdapter } = require('@semapps/triplestore');

module.exports = {
  name: 'solid-notifications.listener',
  mixins: [DbService],
  adapter: new TripleStoreAdapter({ type: 'WebhookChannelListener', dataset: 'settings' }),
  settings: {
    baseUrl: undefined
  },
  dependencies: ['api'],
  async started() {
    if (!this.settings.baseUrl) throw new Error(`The baseUrl setting is required`);

    // Retrieve all active listeners
    const results = await this.actions.list({});
    this.listeners = results.rows;

    console.log('active listener', this.listeners);

    await this.broker.call('api.addRoute', {
      route: {
        path: '/.webhooks/:uuid',
        authorization: false,
        authentication: false,
        aliases: {
          'POST /': 'solid-notifications.listener.process'
        },
        bodyParsers: { json: true }
      }
    });
  },
  actions: {
    async add(ctx) {
      const { webId, actionName } = ctx.params;

      const appActor = await ctx.call('actors.getApp');

      // Check if a channel already exist

      // Discover webhook endpoint
      const storageDescription = await this.getSolidEndpoint(webId);
      const webhookChannelEndpointUrl = storageDescription['notify:subscription'][1];

      // Find user inbox
      const inboxUri = await ctx.call('activitypub.actor.getCollectionUri', { actorUri: webId, predicate: 'inbox' });

      // Generate a webhook path
      const webhookUrl = urlJoin(this.settings.baseUrl, '.webhooks', uuidv4());

      // Create a webhook channel (authenticate with HTTP signature)
      const { body } = await appServer.call('signature.proxy.query', {
        url: webhookChannelEndpointUrl,
        method: 'POST',
        headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
        body: JSON.stringify({
          '@context': {
            notify: 'http://www.w3.org/ns/solid/notifications#'
          },
          '@type': 'notify:WebhookChannel2023',
          'notify:topic': inboxUri,
          'notify:sendTo': webhookUrl
        }),
        actorUri: appActor.id
      });

      const listener = {
        webhookUrl,
        channelUri: body.id,
        actionName
      };

      this.listeners.push(listener);

      // Save webhook + channel on the settings dataset
      return await this._create(ctx, listener);
    },
    async process(ctx) {
      const { uuid, ...data } = ctx.params;
      const webhookUrl = urlJoin(this.settings.baseUrl, '.webhooks', uuid);

      const listener = this.listeners.find(l => l.webhookUrl === webhookUrl);

      if (listener) {
        await ctx.call(listener.actionName, data);
      } else {
        this.logger.warn(`No webhook found with URL ${webhookUrl}`);
        throw new MoleculerError(`No webhook found with URL ${webhookUrl}`, 404, 'NOT_FOUND');
      }
    }
  },
  methods: {
    async getSolidEndpoint(resourceUri) {
      const solidEndpointUrl = new URL(resourceUri).origin;
      const response = await fetch(solidEndpointUrl, {
        headers: {
          Accept: 'application/ld+json'
        }
      });

      if (response.ok) {
        return await response.json();
      } else {
        return false;
      }
    }
  }
};
