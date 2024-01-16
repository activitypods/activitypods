const urlJoin = require('url-join');
const fetch = require('node-fetch');
const { Errors: E } = require('moleculer-web');
const { parseHeader, negotiateContentType, parseJson } = require('@semapps/middlewares');
const { ControlledContainerMixin, getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'solid-notifications.provider.webhook',
  mixins: [ControlledContainerMixin],
  settings: {
    baseUrl: null,
    // ControlledContainerMixin
    acceptedTypes: ['notify:WebhookChannel2023'],
    readOnly: true
  },
  dependencies: ['api'],
  async created() {
    if (!this.settings.baseUrl) throw new Error('The baseUrl setting is required');
    if (!this.createJob) throw new Error('The QueueMixin must be configured with this service');
  },
  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'notification-webhook',
        path: '/.notifications/WebhookChannel2023',
        bodyParsers: false,
        authorization: false,
        authentication: true,
        aliases: {
          'GET /': 'solid-notifications.provider.webhook.discover',
          'POST /': [parseHeader, negotiateContentType, parseJson, 'solid-notifications.provider.webhook.createChannel']
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
      const type = ctx.params.type || ctx.params['@type'];
      const topic = ctx.params.topic || ctx.params['notify:topic'];
      const sendTo = ctx.params.sendTo || ctx.params['notify:sendTo'];
      const webId = ctx.meta.webId;

      if (type !== 'notify:WebhookChannel2023')
        throw new Error('Only notify:WebhookChannel2023 is accepted on this endpoint');

      // Ensure topic exist (LDP resource, container or collection)
      const exists = await ctx.call('ldp.resource.exist', {
        resourceUri: topic,
        webId: 'system'
      });
      if (!exists) throw new E.BadRequestError('Cannot watch unexisting resource');

      // Ensure topic can be watched by the authenticated agent
      const rights = await ctx.call('webacl.resource.hasRights', {
        resourceUri: topic,
        rights: { read: true },
        webId
      });
      if (!rights.read) throw new E.ForbiddenError('You need acl:Read rights on the resource');

      // Find container URI from topic (must be stored on same Pod)
      const topicWebId = urlJoin(this.settings.baseUrl, getDatasetFromUri(topic));
      const channelContainerUri = await this.actions.getContainerUri({ webId: topicWebId }, { parentCtx: ctx });

      // Post channel on Pod
      const channelUri = await this.actions.post(
        {
          containerUri: channelContainerUri,
          resource: {
            type: 'notify:WebhookChannel2023',
            'notify:topic': topic,
            'notify:sendTo': sendTo
          },
          contentType: MIME_TYPES.JSON,
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
          accept: MIME_TYPES.JSON,
          webId: 'system'
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
        const activity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: 'urn:123456:http://example.com/foo',
          type: 'Add',
          object: itemUri,
          target: collectionUri,
          state: '987654',
          published: '2023-02-09T15:08:12.345Z'
        };

        this.createJob(
          'remotePost',
          channel.sendTo,
          { channel, activity },
          { attempts: 10, backoff: { type: 'exponential', delay: 1000 } }
        );
      }
    }
  },
  queues: {
    remotePost: {
      name: '*',
      async process(job) {
        const { channel, activity } = job.data;

        const response = await fetch(channel.sendTo, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify(activity)
        });

        if (!response.ok) {
          job.retry();
        } else {
          job.progress(100);
        }

        return { response };
      }
    }
  }
};
