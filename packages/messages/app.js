const MessageService = require('./services/message');

const MessagesApp = {
  name: 'messages',
  async created() {
    this.broker.createService(MessageService);
  }
};

module.exports = MessagesApp;
