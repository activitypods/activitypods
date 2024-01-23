const urlJoin = require('url-join');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const DbService = require('moleculer-db');
const { MoleculerError } = require('moleculer').Errors;
const { parseHeader, negotiateContentType, parseJson } = require('@semapps/middlewares');
const { TripleStoreAdapter } = require('@semapps/triplestore');

module.exports = {
  name: 'solid-notifications.listener',
  mixins: [DbService],
  adapter: new TripleStoreAdapter({ type: 'WebhookChannelListener', dataset: 'settings' }),
  settings: {
    baseUrl: undefined,
    // DbService settings
    idField: '@id'
  },
  // TODO remove dependency to actors service by passing the app URI in the settings ?
  dependencies: ['api', 'actors'],
  async started() {
    if (!this.settings.baseUrl) throw new Error(`The baseUrl setting is required`);

    // Retrieve all active listeners
    const results = await this.actions.list({});
    this.listeners = results.rows;

    console.log('Webhook listeners on start', this.listeners);

    await this.broker.call('api.addRoute', {
      route: {
        path: '/.webhooks/:uuid',
        authorization: false,
        authentication: false,
        aliases: {
          'POST /': [parseHeader, negotiateContentType, parseJson, 'solid-notifications.listener.transfer']
        },
        bodyParsers: false
      }
    });
  },
  actions: {
    async register(ctx) {
      const { resourceUri, actionName } = ctx.params;

      const appActor = await ctx.call('actors.getApp');

      // Check if a listener already exist
      const existingListener = this.listeners.some(
        listener => listener.resourceUri === resourceUri && listener.actionName === actionName
      );
      if (existingListener) return existingListener;

      // Discover webhook endpoint
      const storageDescription = await this.getSolidEndpoint(resourceUri);
      if (!storageDescription) throw new Error(`No storageDescription found for resourceUri ${resourceUri}`);

      // Fetch all subscriptions URLs
      const results = await Promise.all(
        storageDescription['notify:subscription'].map(channelSubscriptionUrl =>
          fetch(channelSubscriptionUrl, {
            headers: {
              Accept: 'application/ld+json'
            }
          }).then(res => res.ok && res.json())
        )
      );

      // Find webhook channel
      const webhookSubscription = results.find(
        subscription => subscription && subscription['notify:channelType'] === 'notify:WebhookChannel2023'
      );

      if (!webhookSubscription) throw new Error(`No webhook subscription URL found for resourceUri ${resourceUri}`);

      // Ensure webhookSubscription['notify:features'] are correct

      // Generate a webhook path
      const webhookUrl = urlJoin(this.settings.baseUrl, '.webhooks', uuidv4());

      // Create a webhook channel (authenticate with HTTP signature)
      const { body } = await ctx.call('signature.proxy.query', {
        url: webhookSubscription.id || webhookSubscription['@id'],
        method: 'POST',
        headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
        body: JSON.stringify({
          '@context': {
            notify: 'http://www.w3.org/ns/solid/notifications#'
          },
          '@type': 'notify:WebhookChannel2023',
          'notify:topic': resourceUri,
          'notify:sendTo': webhookUrl
        }),
        actorUri: appActor.id
      });

      const listener = {
        webhookUrl,
        resourceUri,
        channelUri: body.id,
        actionName
      };

      this.listeners.push(listener);

      // Persist listener on the settings dataset
      await this._create(ctx, listener);

      return listener;
    },
    async transfer(ctx) {
      const { uuid, ...data } = ctx.params;
      const webhookUrl = urlJoin(this.settings.baseUrl, '.webhooks', uuid);

      const listener = this.listeners.find(l => l.webhookUrl === webhookUrl);

      if (listener) {
        await ctx.call(listener.actionName, data);
      } else {
        this.logger.warn(`No webhook found with URL ${webhookUrl}`);
        // throw new MoleculerError(`No webhook found with URL ${webhookUrl}`, 404, 'NOT_FOUND');
      }
    }
  },
  methods: {
    async getSolidEndpoint(resourceUri) {
      // TODO See why we can't get the Solid endpoint URL through link headers
      // const response = await fetch(resourceUri, {
      //   method: 'HEAD'
      // });
      // const linkHeader = response.headers.get('Link');

      const solidEndpointUrl = urlJoin(new URL(resourceUri).origin, '.well-known', 'solid');
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
