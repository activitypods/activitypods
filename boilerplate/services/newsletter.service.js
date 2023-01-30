const path = require("path");
const MailService = require('moleculer-mail');
const CONFIG = require('../config/config');
const transport = require('../config/transport');

module.exports = {
  name: 'newsletter',
  mixins: [MailService],
  settings: {
    templateFolder: path.join(__dirname, '../templates'),
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport,
    data: {}
  },
  actions: {
    async sendNewsletter(ctx) {
      const { username, template } = ctx.params;

      const accounts = username === 'all'
        ? await ctx.call('auth.account.find')
        : await ctx.call('auth.account.find', { query: { username } })

      if (accounts.length === 0) {
        throw new Error('No account found for username ' + username);
      }

      for (let account of accounts) {
        await this.actions.send({
          to: account.email,
          template,
          data: {
            account
          }
        });
      }
    }
  }
}