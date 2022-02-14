const AttendeesMatcherService = require('./services/attendees-matcher');
const EventService = require('./services/event');
const InvitationService = require('./services/invitation');
const RegistrationService = require('./services/registration');
const StatusService = require('./services/status');
const translations = require('./translations');

const EventsApp = {
  name: 'events',
  dependencies: ['notification'],
  settings: {
    status: {
      coming: null,
      finished: null,
      open: null,
      closed: null,
    },
  },
  created() {
    let { status } = this.settings;

    this.broker.createService(EventService);

    this.broker.createService(InvitationService);

    this.broker.createService(RegistrationService);

    this.broker.createService(AttendeesMatcherService);

    this.broker.createService(StatusService, {
      settings: { status },
    });
  },
  async started() {
    await this.broker.call('notification.loadTranslations', { translations })
  }
};

module.exports = EventsApp;
