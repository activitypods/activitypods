const path = require('path');
const MailService = require('moleculer-mail');
const { ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { arrayOf } = require('@semapps/ldp');

module.exports = {
  name: 'mail-notifications',
  mixins: [MailService, ActivitiesHandlerMixin],
  settings: {
    // See moleculer-mail doc https://github.com/moleculerjs/moleculer-addons/tree/master/packages/moleculer-mail
    templateFolder: path.join(__dirname, '../templates'),
    from: null,
    transport: null,
    data: {
      color: '#E2003B'
    }
  },
  activities: {
    appNotification: {
      match: {
        type: 'apods:Notification'
      },
      async onReceive(ctx, activity, recipientUri) {
        if (!(await ctx.call('app-registrations.isRegistered', { appUri: activity.actor, podOwner: recipientUri }))) {
          this.logger.warn(`Application ${activity.actor} is not registered by ${recipientUri}`);
          return;
        }

        const account = await ctx.call('auth.account.findByWebId', { webId: recipientUri });

        await this.queueMail(ctx, activity.name, {
          to: account.email,
          data: {
            title: activity.name,
            content: activity.content,
            contentWithBr: activity.content ? activity.content.replace(/\r\n|\r|\n/g, '<br />') : undefined,
            actions: arrayOf(activity.url).map(url => ({ caption: url.name, link: url.href }))
          }
        });
      }
    }
  },
  methods: {
    async queueMail(ctx, title, payload) {
      payload.template = 'single-mail';
      if (this.createJob) {
        return this.createJob('sendMail', title, payload);
      }
      await this.actions.send(payload, { parentCtx: ctx });
    }
  },
  queues: {
    sendMail: {
      name: '*',
      async process(job) {
        job.progress(0);
        const result = await this.actions.send(job.data);
        job.progress(100);
        return result;
      }
    }
  }
};
