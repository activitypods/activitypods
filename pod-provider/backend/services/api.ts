import fs from 'fs';
import path from 'path';
import ApiGatewayService from 'moleculer-web';
// @ts-expect-error TS(2614): Module '"moleculer-web"' has no exported member 'E... Remove this comment to see the full error message
import { Errors as E } from 'moleculer-web';
import WebSocketMixin from '../mixins/websocket.ts';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type 'ServiceSchema<ServiceSettingSchema, Service<... Remove this comment to see the full error message
  mixins: [ApiGatewayService, WebSocketMixin],
  settings: {
    httpServerTimeout: 300000,
    baseUrl: CONFIG.BASE_URL,
    port: CONFIG.PORT,
    cors: {
      origin: '*',
      methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
      exposedHeaders: '*'
    },
    routes: [
      {
        name: 'favicon',
        path: '/favicon.ico',
        aliases: {
          'GET /': 'api.favicon'
        }
      },
      {
        name: 'redirectToFront',
        path: '/',
        aliases: {
          'GET /': 'api.redirectToFront'
        }
      }
    ]
  },
  actions: {
    favicon: {
      handler(ctx) {
        // @ts-expect-error TS(2339): Property '$responseType' does not exist on type '{... Remove this comment to see the full error message
        ctx.meta.$responseType = 'image/x-icon';
        return fs.readFileSync(path.resolve(__dirname, '../static/favicon.ico'));
      }
    },

    redirectToFront: {
      handler(ctx) {
        // @ts-expect-error TS(2339): Property '$statusCode' does not exist on type '{}'... Remove this comment to see the full error message
        ctx.meta.$statusCode = 302;
        // @ts-expect-error TS(2339): Property '$location' does not exist on type '{}'.
        ctx.meta.$location = CONFIG.FRONTEND_URL;
      }
    }
  },
  methods: {
    async authenticate(ctx, route, req, res) {
      if (req.headers.signature) {
        return ctx.call('signature.authenticate', { route, req, res });
      }
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const payload = await ctx.call('auth.jwt.decodeToken', { token });
        if (payload?.azp) {
          // This is a OIDC provider-generated ID token
          return ctx.call('solid-oidc.authenticate', { route, req, res });
        }
        // Otherwise it is a custom JWT token (used by ActivityPods frontend)
        return ctx.call('auth.authenticate', { route, req, res });
      }

      ctx.meta.webId = 'anon';
      return null;
    },
    async authorize(ctx, route, req, res) {
      if (req.headers.signature) {
        return ctx.call('signature.authorize', { route, req, res });
      }
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const payload = await ctx.call('auth.jwt.decodeToken', { token });
        if (payload.azp) {
          // This is a OIDC provider-generated ID token
          return ctx.call('solid-oidc.authorize', { route, req, res });
        }
        // Otherwise it is a custom JWT token (used by ActivityPods frontend) or a VC capability
        return ctx.call('auth.authorize', { route, req, res });
      }
      ctx.meta.webId = 'anon';
      throw new E.UnAuthorizedError(E.ERR_NO_TOKEN);
    },
    // Overwrite optimization method to put catchAll routes at the end
    // See https://github.com/moleculerjs/moleculer-web/issues/335
    optimizeRouteOrder() {
      this.routes.sort((a: any) => (a.opts.catchAll ? 1 : -1));
      this.aliases.sort((a: any) => (a.route.opts.catchAll ? 1 : -1));
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
