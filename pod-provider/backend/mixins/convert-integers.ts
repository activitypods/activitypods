import { ServiceSchema } from 'moleculer';

type ConvertIntegerSettings = {
  integerPredicates: Array<string>;
};

const ConvertIntegerMixin = {
  settings: {
    integerPredicates: []
  },
  hooks: {
    after: {
      async get(ctx, res) {
        for (const p of this.settings.integerPredicates) {
          if (typeof res[p] === 'string') res[p] = parseInt(res[p]);
        }

        return res;
      }
    }
  }
} satisfies Partial<ServiceSchema<ConvertIntegerSettings>>;

export default ConvertIntegerMixin;
