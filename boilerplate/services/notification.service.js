const path = require('path');
const urlJoin = require('url-join');
const NotificationService = require('moleculer-mail');
const QueueService = require('moleculer-bull');
const nodemailerSendgrid = require('nodemailer-sendgrid');
const { MIME_TYPES } = require('@semapps/mime-types');
const CONFIG = require('../config');

const transportSMTP = {
  host: CONFIG.SMTP_HOST,
  port: CONFIG.SMTP_PORT,
  secure: CONFIG.SMTP_SECURE,
  auth: {
    user: CONFIG.SMTP_USER,
    pass: CONFIG.SMTP_PASS,
  },
};

const transportAPI = nodemailerSendgrid({ apiKey: CONFIG.SMTP_PASS });

module.exports = {
  name: 'notification',
  mixins: CONFIG.QUEUE_SERVICE_URL
    ? [NotificationService, QueueService(CONFIG.QUEUE_SERVICE_URL)]
    : [NotificationService],
  settings: {
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport: transportAPI,
    templateFolder: path.join(__dirname, '../templates'),
    data: {
      frontName: CONFIG.FRONT_NAME,
      frontUrl: CONFIG.FRONT_URL,
      frontLogo: CONFIG.FRONT_LOGO,
    },
  },
  actions: {
    async invitation(ctx) {
      const { eventUri, senderUri, recipientUri } = ctx.params;
      const event = await ctx.call('activitypub.object.get', { objectUri: eventUri, actorUri: recipientUri });
      const sender = await this.getActorProfile(ctx, senderUri, recipientUri);

      await this.queueMail(ctx, 'invitation', {
        to: recipientUri,
        data: {
          event,
          eventFrontUri: urlJoin(CONFIG.FRONT_URL, 'Event', encodeURIComponent(eventUri), 'show'),
          sender,
        },
      });
    },
    async joinOrLeave(ctx) {
      const { eventUri, userUri, joined } = ctx.params;
      const event = await ctx.call('events.event.get', { resourceUri: eventUri }, { meta: { webId: 'system' } });
      const user = await this.getActorProfile(ctx, userUri, event['dc:creator']);

      await this.queueMail(ctx, 'join-or-leave', {
        to: event['dc:creator'],
        data: {
          event,
          eventFrontUri: urlJoin(CONFIG.FRONT_URL, 'Event', encodeURIComponent(eventUri), 'show'),
          user,
          joined,
        },
      });
    },
    async contactOffer(ctx) {
      const { senderUri, recipientUri, message } = ctx.params;
      const sender = await this.getActorProfile(ctx, senderUri, recipientUri);

      await this.queueMail(ctx, 'contact-offer', {
        to: recipientUri,
        data: {
          sender,
          message,
          networkFrontUri: urlJoin(CONFIG.FRONT_URL, 'Profile'),
        },
      });
    },
    async newMessage(ctx) {
      const { senderUri, recipientUri, content } = ctx.params;
      const sender = await this.getActorProfile(ctx, senderUri, recipientUri);

      await this.queueMail(ctx, 'new-message', {
        to: recipientUri,
        data: {
          sender,
          profileFrontUri: urlJoin(CONFIG.FRONT_URL, 'Profile', encodeURIComponent(sender.id), 'show'),
          content,
          contentWithBr: content.replace(/\r\n|\r|\n/g, '<br />'),
        },
      });
    },
  },
  methods: {
    async getActorProfile(ctx, actorUri, webId) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      if (actor.url) {
        try {
          return await ctx.call('ldp.resource.get', { resourceUri: actor.url, accept: MIME_TYPES.JSON, webId });
        } catch (e) {
          return { 'vcard:given-name': '@' + actor.preferredUsername };
        }
      }
    },
    async queueMail(ctx, template, payload) {
      const recipientAccount = await ctx.call('auth.account.findByWebId', { webId: payload.to });
      payload.to = recipientAccount.email;
      payload.template = template;
      if (this.createJob) {
        return this.createJob('sendMail', template, payload);
      } else {
        await ctx.call('notification.send', payload);
      }
    },
  },
  queues: {
    sendMail: {
      name: '*',
      async process(job) {
        job.progress(0);
        const result = await this.broker.call('notification.send', job.data);
        job.progress(100);
        return result;
      },
    },
  },
};
