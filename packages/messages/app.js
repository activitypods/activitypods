const MessageService = require('./services/message');
const translations = require('./translations');

const MessagesApp = {
  name: 'messages',
  created() {
    this.broker.createService(MessageService);
  }
};

module.exports = MessagesApp;
