import CONFIG from '../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const FrontendConfigSchema = {
  name: 'frontend-config' as const,
  dependencies: ['api'],
  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/.well-known/config.js',
        name: 'config',
        aliases: {
          'GET /': 'frontend-config.get'
        }
      }
    });
  },
  actions: {
    get: defineAction({
      async handler(ctx) {
        ctx.meta.$responseType = 'text/javascript';
        return `
          window.CONFIG = {
            INSTANCE_NAME: "${CONFIG.INSTANCE_NAME}",
            INSTANCE_DESCRIPTION: {${Object.entries(CONFIG.INSTANCE_DESCRIPTION)
              .map(([key, value]) => `${key}: "${value}"`)
              .join(', ')}},
            INSTANCE_OWNER: "${CONFIG.INSTANCE_OWNER}",
            INSTANCE_AREA: "${CONFIG.INSTANCE_AREA}",
            AVAILABLE_LOCALES: [${CONFIG.AVAILABLE_LOCALES.map((l: any) => `"${l}"`).join(', ')}],
            DEFAULT_LOCALE: "${CONFIG.DEFAULT_LOCALE}",
            ENABLE_GROUPS: ${CONFIG.ENABLE_GROUPS},
            BACKEND_URL: "${CONFIG.BASE_URL}",
            MAPBOX_ACCESS_TOKEN: "${CONFIG.MAPBOX_ACCESS_TOKEN}",
            COLOR_PRIMARY: "${CONFIG.COLOR_PRIMARY}",
            COLOR_SECONDARY: "${CONFIG.COLOR_SECONDARY}",
          };
        `;
      }
    })
  }
} satisfies ServiceSchema;

export default FrontendConfigSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [FrontendConfigSchema.name]: typeof FrontendConfigSchema;
    }
  }
}
