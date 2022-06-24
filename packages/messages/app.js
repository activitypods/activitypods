const MessageService = require('./services/message');

const MessagesApp = {
  name: 'messages',
  created() {
    this.broker.createService(MessageService);
  },
};

module.exports = MessagesApp;
