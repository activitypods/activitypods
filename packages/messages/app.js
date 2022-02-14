const MessageService = require('./services/message');
const translations = require('./translations');

const MessagesApp = {
  name: 'messages',
  dependencies: ['notification'],
  created() {
    this.broker.createService(MessageService);
  },
  async started() {
    await this.broker.call('notification.loadTranslations', { translations });
  },
};

module.exports = MessagesApp;
