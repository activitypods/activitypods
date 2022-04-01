const AttendeesMatcherService = require('./services/attendees-matcher');
const EventService = require('./services/event');
const InvitationService = require('./services/invitation');
const RegistrationService = require('./services/registration');
const StatusService = require('./services/status');
const translations = require('./translations');

const EventsApp = {
  name: 'events',
  dependencies: ['notification'],
  created() {
    this.broker.createService(EventService);

    this.broker.createService(InvitationService);

    this.broker.createService(RegistrationService);

    this.broker.createService(AttendeesMatcherService);

    this.broker.createService(StatusService);
  }
};

module.exports = EventsApp;
