const path = require('path');
const urlJoin = require('url-join');
const MailService = require('moleculer-mail');

module.exports = {
  name: 'notification',
  mixins: [MailService],
  settings: {
    templateFolder: path.join(__dirname, './templates'),
    // To be set by user
    // See moleculer-mail doc https://github.com/moleculerjs/moleculer-addons/tree/master/packages/moleculer-mail
    from: null,
    transport: null,
    // Base data used in all emails
    data: {
      frontName: null,
      frontUrl: null,
      frontLogo: null,
    },
  },
  actions: {
    async notifyUser(ctx) {
      const { to, key, payload } = ctx.params;

      const action = payload.actions ? payload.actions[0] : {}
      if( action.link ) action.link = urlJoin(this.settings.data.frontUrl, action.link);

      await this.queueMail(ctx, key, {
        to,
        data: {
          title: payload.title,
          body: payload.body,
          bodyWithBr: payload.body ? payload.body.replace(/\r\n|\r|\n/g, '<br />') : undefined,
          action
        },
      });
    }
  },
  methods: {
    async queueMail(ctx, key, payload) {
      const recipientAccount = await ctx.call('auth.account.findByWebId', { webId: payload.to });
      payload.to = recipientAccount.email;
      payload.template = 'single-notification';
      if (this.createJob) {
        return this.createJob('sendMail', key, payload);
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
      }
    }
  }
};
