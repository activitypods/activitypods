import Handlebars from 'handlebars';
import { isObject } from '@semapps/ldp';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

const TranslatorSchema = {
  name: 'translator' as const,
  settings: {
    frontUrl: null,
    handlebars: {
      helpers: {
        encodeUri: (uri: any) => encodeURIComponent(uri)
      }
    }
  },
  async started() {
    // @ts-expect-error TS(2339): Property 'settings' does not exist on type 'void'.
    for (const [name, fn] of Object.entries(this.settings.handlebars.helpers)) {
      // @ts-expect-error TS(2339): Property 'logger' does not exist on type 'void'.
      this.logger.info(`Registering handlebars helper ${name}`);
      // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
      Handlebars.registerHelper(name, fn);
    }
  },
  actions: {
    translate: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { template, templateParams, actorUri } = ctx.params;

        // Get the locale of the actor
        const actor = await ctx.call('activitypub.actor.get', { actorUri });
        const locale = actor['schema:knowsLanguage'] || 'en';

        return this.parseTemplate(template, templateParams, locale);
      }
    })
  },
  methods: {
    parseTemplate(template, params, locale) {
      return (
        template &&
        Object.fromEntries(
          // @ts-expect-error TS(2769): No overload matches this call.
          Object.entries(template).map(([key, value]) => {
            if (typeof value === 'string') {
              const compiledValue = Handlebars.compile(value);
              return [key, compiledValue(params)];
            } else if (isObject(value)) {
              // If we have an object with locales mapping, look for the right locale
              // @ts-expect-error TS(18046): 'value' is of type 'unknown'.
              if (value[locale]) {
                // @ts-expect-error TS(18046): 'value' is of type 'unknown'.
                const compiledValue = Handlebars.compile(value[locale]);
                return [key, compiledValue(params)];
              } else {
                throw new Error(`No ${locale} locale found for key ${key}`);
              }
            } else if (Array.isArray(value)) {
              return [key, value.map(v => this.parseTemplate(v, params, locale))];
            }
          })
        )
      );
    }
  }
} satisfies ServiceSchema;

export default TranslatorSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [TranslatorSchema.name]: typeof TranslatorSchema;
    }
  }
}
