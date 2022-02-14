const path = require('path');
const urlJoin = require('url-join');
const MailService = require('moleculer-mail');
const Polyglot = require('node-polyglot');

module.exports = {
  name: 'notification',
  mixins: [MailService],
  settings: {
    templateFolder: path.join(__dirname, './templates'),
    // To be set by user
    // See moleculer-mail doc https://github.com/moleculerjs/moleculer-addons/tree/master/packages/moleculer-mail
    from: null,
    transport: null,
    defaults: {
      locale: 'en',
      frontUrl: null,
    },
  },
  started() {
    this.polyglots = new Map();
  },
  actions: {
    async loadTranslations(ctx) {
      const { translations } = ctx.params;
      for (let [locale, phrases] of Object.entries(translations)) {
        if (this.polyglots.has(locale)) {
          this.polyglots.get(locale).extend(phrases);
        } else {
          this.polyglots.set(locale, new Polyglot({ phrases, locale, allowMissing: true }));
        }
      }
    },
    async notifyUser(ctx) {
      const { recipientUri, key, payload, vars } = ctx.params;

      const recipientAccount = await ctx.call('auth.account.findByWebId', { webId: recipientUri });
      const preferredLocale = recipientAccount.preferredLocale || this.settings.defaults.locale;
      const preferredFrontUrl = recipientAccount.preferredFrontUrl || this.settings.defaults.frontUrl;

      const action = payload.actions ? payload.actions[0] : {};
      if (action.link) action.link = urlJoin(preferredFrontUrl, action.link);
      action.name = this.translate(action.name, preferredLocale, vars);

      const title = this.translate(payload.title, preferredLocale, vars);
      const body = payload.body ? this.translate(payload.body, preferredLocale, vars) : undefined;

      await this.queueMail(ctx, key, {
        to: recipientAccount.email,
        data: {
          title,
          body,
          bodyWithBr: body ? body.replace(/\r\n|\r|\n/g, '<br />') : undefined,
          action,
        },
      });
    },
  },
  methods: {
    async queueMail(ctx, key, payload) {
      payload.template = 'single-notification';
      if (this.createJob) {
        return this.createJob('sendMail', key, payload);
      } else {
        await ctx.call('notification.send', payload);
      }
    },
    translate(key, locale, options = {}) {
      if (this.polyglots.has(locale)) {
        return this.polyglots.get(locale).t(key, options);
      } else {
        throw new Error(`Key ${key} not found with locale ${locale}`);
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
