import { ServiceSchema } from 'moleculer';

type ConvertBooleanSettings = {
  booleanPredicates: Array<string>;
};

const ConvertBooleanMixin = {
  settings: {
    booleanPredicates: []
  },
  hooks: {
    after: {
      async get(ctx, res) {
        for (const p of this.settings.booleanPredicates) {
          if (typeof res[p] === 'string') res[p] = res[p] === 'true';
        }

        return res;
      }
    }
  }
} satisfies Partial<ServiceSchema<ConvertBooleanSettings>>;

export default ConvertBooleanMixin;
