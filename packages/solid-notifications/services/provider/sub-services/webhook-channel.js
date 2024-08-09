const urlJoin = require('url-join');
const fetch = require('node-fetch');
const NotificationChannelMixin = require('./notification-channel.mixin');

const queueOptions =
  process.env.NODE_ENV === 'test'
    ? {}
    : {
        // Try again after 3 minutes and until 12 hours later
        attempts: 8,
        backoff: { type: 'exponential', delay: '180000' }
      };

/** @type {import('moleculer').ServiceSchema} */
const WebhookChannel2023Service = {
  name: 'solid-notifications.provider.webhook',
  mixins: [NotificationChannelMixin],
  settings: {
    channelType: 'WebhookChannel2023',
    sendOrReceive: 'send',

    baseUrl: null
  },
  created() {
    if (!this.createJob) throw new Error('The QueueMixin must be configured with this service');
  },
  actions: {
    async discover(ctx) {
      // TODO Handle content negotiation
      ctx.meta.$responseType = 'application/ld+json';
      // Cache for 1 day.
      ctx.meta.$responseHeaders = { 'Cache-Control': 'public, max-age=86400' };
      return {
        '@context': { notify: 'http://www.w3.org/ns/solid/notifications#' },
        '@id': urlJoin(this.settings.baseUrl, '.notifications', 'WebhookChannel2023'),
        'notify:channelType': 'notify:WebhookChannel2023',
        'notify:feature': ['notify:endAt', 'notify:rate', 'notify:startAt', 'notify:state']
      };
    },
    async deleteAppChannels(ctx) {
      const { appUri, webId } = ctx.params;
      const { origin: appOrigin } = new URL(appUri);
      const appChannels = this.channels.filter(c => c.webId === webId && c.sendTo.startsWith(appOrigin));
      for (const appChannel of appChannels) {
        await this.actions.delete({ resourceUri: appChannel.id, webId: appChannel.webId });
      }
    }
  },

  methods: {
    onEvent(channel, activity) {
      this.createJob('webhookPost', channel.sendTo, { channel, activity }, queueOptions);
    }
  },
  queues: {
    webhookPost: {
      name: '*',
      async process(job) {
        const { channel, activity } = job.data;

        try {
          const response = await fetch(channel.sendTo, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify({
              ...activity,
              published: new Date().toISOString()
            })
          });

          if (response.status >= 400) {
            await this.actions.delete({ resourceUri: channel.id, webId: channel.webId });
            throw new Error(
              `Webhook ${channel.sendTo} returned a ${response.status} error (${response.statusText}). It has been deleted.`
            );
          } else {
            job.progress(100);
          }

          return { ok: response.ok, status: response.status, statusText: response.statusText };
        } catch (e) {
          if (job.attemptsMade + 1 >= job.opts.attempts) {
            this.logger.warn(`Webhook ${channel.sendTo} failed ${job.opts.attempts} times, deleting it...`);
            // DO NOT DELETE YET TO IMPROVE MONITORING
            // await this.actions.delete({ resourceUri: channel.id, webId: channel.webId });
          }

          throw new Error(`Posting to webhook ${channel.sendTo} failed. Error: (${e.message})`);
        }
      }
    }
  }
};

module.exports = WebhookChannel2023Service;
