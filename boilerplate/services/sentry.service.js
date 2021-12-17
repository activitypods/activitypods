const Sentry = require('@sentry/node');
const SentryUtils = require('@sentry/utils');
const CONFIG = require('../config');

module.exports = {
  name: 'sentry',
  settings: {
    dsn: CONFIG.SENTRY_DSN,
    options: {
      environment: CONFIG.SENTRY_ENVIRONMENT,
    },
    scope: {
      user: null,
    },
  },
  actions: {
    sendError(ctx) {
      const { error, requestID, params, action, event } = ctx.params;
      if (this.isSentryReady()) {
        Sentry.withScope((scope) => {
          scope.setTag('id', requestID);

          if (event) {
            scope.setTag('localization', 'event');
            scope.setTag('service', event.service.name);
            scope.setTag('event', event.name);
          }

          if (action) {
            scope.setTag('localization', 'action');
            scope.setTag('service', action.service.name);
            scope.setTag('action', action.name);
          }

          if (params.req) {
            const { req, res, ...otherParams } = params;
            scope.setExtra('params', { ...req['$params'], ...otherParams });
          } else {
            scope.setExtra('params', params);
          }

          // if (this.settings.scope && this.settings.scope.user && metric.meta && metric.meta[this.settings.scope.user]) {
          //   scope.setUser(metric.meta[this.settings.scope.user])
          // }

          Sentry.captureException(error);
        });
      }
    },
  },
  methods: {
    isSentryReady() {
      return Sentry.getCurrentHub().getClient() !== undefined;
    },
  },
  started() {
    if (this.settings.dsn) {
      Sentry.init({ dsn: this.settings.dsn, ...this.settings.options });
    }
  },
  async stopped() {
    if (this.isSentryReady()) {
      await Sentry.flush();
      SentryUtils.getGlobalObject().__SENTRY__ = undefined;
    }
  },
};
