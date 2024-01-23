const urlJoin = require('url-join');
const { arrayOf } = require('@semapps/ldp');

const AppControlMiddleware = ({ baseUrl }) => ({
  name: 'AppControlMiddleware',
  async started() {
    if (!baseUrl) throw new Error('The baseUrl config is missing for the AppControlMiddleware');
  },
  localAction: (next, action) => {
    if (action.name === 'signature.proxy.api_query') {
      return async ctx => {
        const podOwner = urlJoin(baseUrl, ctx.params.username);

        if (ctx.meta.webId === podOwner) {
          // User is querying is own pod
          return next(ctx);
        }

        const appRegistrationsContainer = await ctx.call('app-registrations.list', { webId: podOwner });

        // Check if the webId is a registered application
        if (
          arrayOf(appRegistrationsContainer['ldp:contains']).some(
            appReg => appReg['interop:registeredAgent'] === ctx.meta.webId
          )
        ) {
          ctx.meta.webId = podOwner;
        }

        // Check if the application has the right to query the proxy

        // Check if the application has the right to handle this type of data

        return next(ctx);
      };
    }

    // Do not use the middleware for this action
    return next;
  }
});

module.exports = AppControlMiddleware;
