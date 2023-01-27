const LocationService = require('./services/location');
const MessageService = require('./services/message');
const OfferService = require('./services/offer');
const ProjectService = require('./services/project');
const RequestService = require('./services/request');

const MarketplaceApp = {
  name: 'marketplace',
  created() {
    this.broker.createService(LocationService);

    this.broker.createService(MessageService);

    this.broker.createService(OfferService);

    this.broker.createService(RequestService);

    this.broker.createService(ProjectService);
  },
};

module.exports = MarketplaceApp;
