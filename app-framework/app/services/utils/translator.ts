import Handlebars from 'handlebars';
import { isObject } from '@semapps/ldp';

const TranslatorSchema = {
  name: 'translator',
  settings: {
    frontUrl: null,
    handlebars: {
      helpers: {
        encodeUri: uri => encodeURIComponent(uri)
      }
    }
  },
  async started() {
    for (const [name, fn] of Object.entries(this.settings.handlebars.helpers)) {
      this.logger.info(`Registering handlebars helper ${name}`);
      Handlebars.registerHelper(name, fn);
    }
  },
  actions: {
    async translate(ctx) {
      const { template, templateParams, actorUri } = ctx.params;

      // Get the locale of the actor
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      const locale = actor['schema:knowsLanguage'] || 'en';

      return this.parseTemplate(template, templateParams, locale);
    }
  },
  methods: {
    parseTemplate(template, params, locale) {
      return (
        template &&
        Object.fromEntries(
          Object.entries(template).map(([key, value]) => {
            if (typeof value === 'string') {
              const compiledValue = Handlebars.compile(value);
              return [key, compiledValue(params)];
            } else if (isObject(value)) {
              // If we have an object with locales mapping, look for the right locale
              if (value[locale]) {
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
};

export default TranslatorSchema;
