const urlJoin = require('url-join');
const fetch = require('node-fetch');
const { ControlledContainerMixin, getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'notification.webhook',
  mixins: [ControlledContainerMixin],
  settings: {
    baseUrl: null,
    // ControlledContainerMixin
    acceptedTypes: ['notify:WebhookChannel2023'],
    readOnly: true
  },
  dependencies: ['api'],
  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'notification-webhook',
        path: '/.notifications/WebhookChannel2023',
        authorization: false,
        authentication: true,
        aliases: {
          'GET /': 'notification.webhook.discover',
          'POST /': 'notification.webhook.createChannel'
        }
      }
    });

    this.channels = [];

    // TODO load all channels from all Pods
  },
  actions: {
    async discover(ctx) {
      // TODO Handle content negociation
      ctx.meta.$responseType = 'application/ld+json';
      return {
        '@context': { notify: 'http://www.w3.org/ns/solid/notifications#' },
        '@id': urlJoin(this.settings.baseUrl, '.notifications', 'WebhookChannel2023'),
        'notify:channelType': 'notify:WebhookChannel2023',
        'notify:features': ['notify:accept', 'notify:endAt', 'notify:rate', 'notify:startAt', 'notify:state']
      };
    },
    async createChannel(ctx) {
      // Expect format https://communitysolidserver.github.io/CommunitySolidServer/latest/usage/notifications/#webhooks
      // Correct context: https://github.com/solid/vocab/blob/main/solid-notifications-context.jsonld
      const { type, topic, sendTo } = ctx.params;
      const webId = ctx.meta.webId;

      if (type !== 'notify:WebhookChannel2023')
        throw new Error('Only notify:WebhookChannel2023 is accepted on this endpoint');

      // Ensure topic exist (LDP resource, container or collection)

      // Ensure topic can be watched by the authenticated agent

      // Find container URI from topic (must be stored on same Pod)
      const topicWebId = urlJoin(this.settings.baseUrl, getDatasetFromUri(topic));
      const channelContainerUri = this.actions.getContainerUri({ webId: topicWebId }, { parentCtx: ctx });

      // Post channel on Pod
      const channelUri = await this.actions.post(
        {
          containerUri: channelContainerUri,
          resource: {
            '@context': { notify: 'http://www.w3.org/ns/solid/notifications#' },
            '@type': 'notify:WebhookChannel2023',
            'notify:topic': topic,
            'notify:sendTo': sendTo
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      // Keep track of channel internally
      this.channels.push({
        id: channelUri,
        topic,
        sendTo
      });

      ctx.meta.$responseType = 'application/ld+json';
      return await this.actions.get(
        {
          resourceUri: channelUri,
          accept: MIME_TYPES.JSON
        },
        { parentCtx: ctx }
      );
    }
  },
  events: {
    async 'activitypub.collection.added'(ctx) {
      const { collectionUri, itemUri } = ctx.params;
      const matchingChannels = this.channels.filter(c => c.topic === collectionUri);

      for (const channel of matchingChannels) {
        // TODO use jobs
        await fetch(channel.sendTo, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify({
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: 'urn:123456:http://example.com/foo',
            type: 'Add',
            object: itemUri,
            target: collectionUri,
            state: '987654',
            published: '2023-02-09T15:08:12.345Z'
          })
        });
      }
    }
  }
};
