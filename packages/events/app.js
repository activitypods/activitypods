const EventService = require('./services/event');
const InvitationService = require('./services/invitation');
const PlaceService = require('./services/place');
const RegistrationService = require('./services/registration');
const StatusService = require('./services/status');

const EventsApp = {
  name: 'events',
  settings: {
    status: {
      coming: null,
      finished: null,
      open: null,
      closed: null,
    }
  },
  async created() {
    let { status } = this.settings;

    this.broker.createService(EventService);

    this.broker.createService(InvitationService);

    this.broker.createService(PlaceService);

    this.broker.createService(RegistrationService);

    this.broker.createService(StatusService, {
      settings: { status }
    });
  }
};

module.exports = EventsApp;
