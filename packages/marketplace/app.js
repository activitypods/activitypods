const MessageService = require('./services/message');
const OfferService = require('./services/offer');
const RequestService = require('./services/request');

const MarketplaceApp = {
  name: 'marketplace',
  created() {
    this.broker.createService(MessageService);

    this.broker.createService(OfferService);

    this.broker.createService(RequestService);
  }
};

module.exports = MarketplaceApp;
