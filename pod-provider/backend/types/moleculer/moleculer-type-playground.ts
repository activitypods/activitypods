import { ValidationRuleObject, ValidationSchema, ValidationSchemaMetaKeys } from 'fastest-validator';
import {
  ActionSchema,
  ParameterSchema,
  ServiceAction,
  ServiceActionsSchema,
  ServiceSchema,
  ValidatorSchema
} from 'moleculer';

function defineAction<P extends ValidatorSchema>(actionSchema: ActionSchema<P>): ActionSchema<P> {
  return actionSchema;
}
const smallParamSchema = {
  // Your parameter schema remains the same
  optionalParam: { type: 'string', optional: true },
  defaultParam: { type: 'string' },
  stringParam: { type: 'string' },
  stringArrayParam: { type: 'array', items: 'string' },
  objectParam: { type: 'object', params: { o1: { type: 'string' } } },
  multiParam: {
    type: 'multi',
    rules: [
      { type: 'string' },
      { type: 'object', params: { p1: { type: 'string' } } },
      { type: 'object', params: { p2: { type: 'string' } } }
    ]
  }
} satisfies ValidatorSchema;

// Now you can define actions directly without the helper function
const method2 = {
  params: smallParamSchema,
  handler(ctx) {
    // Types are now properly inferred
    const { params } = ctx;
    const stringParam = params.stringParam;
    // ... rest of your handler code
    return 'string' as string | number;
  }
} satisfies ActionSchema<typeof smallParamSchema>;

const service1 = {
  name: 'service1' as const,
  actions: {
    action1: {
      params: { stringParam: { type: 'string' } },
      handler(ctx) {
        ctx.call('service2.preAction');
        this.schema;
        ctx.params;
        return 2;
      }
    },
    directAction() {
      this.schema;
    }
  }
} satisfies ServiceSchema;

const service2 = {
  name: 'service2' as const,
  actions: {
    preAction: {
      params: {
        /** **You can have documentation here!** */
        param1: { type: 'number', optional: true }
      },
      handler(ctx) {
        ctx.params;
        return ctx.params.param1;
      }
    }
  }
} satisfies ServiceSchema;

const service3 = {
  name: 'service3' as const,
  version: 'v1' as const,
  actions: {
    // Error because it returns a string instead of boolean
    async get(ctx) {
      // Every ctx.call below is strongly typed based on the mapping
      const any8 = await ctx.call('not.registered.fails.not1'); // okay because unknown
      const any9 = await ctx.call('not.registered.fails.not2', { val: 18 }); // okay because unknown

      const any0: number = await ctx.call('service2.preAction'); // Okay because param is optional
      const any1: number = await ctx.call('service2.preAction', { param1: '22' }); // Fails because param is number
      const any2: number = await ctx.call('service1.action1', { stringParam: '' }); // Okay
      const any3: string = await ctx.call('service1.action1', { stringParam: '' }); // Fails because wrong return type
      const any4: number = await ctx.call('service1.action1'); // Fails because Required param
      const some5 = await ctx.call('v1.service3.list', { length: 2 });
    },

    list: defineAction({
      params: {
        length: { type: 'number' }
      },
      handler(ctx) {
        ctx.params.length;
        // Error: length should be of time number but is never.
        const length = ctx.params.length;
        return 'list was called successfully with length param ' + length;
      }
    })
  }
} satisfies ServiceSchema;

const b: ValidatorSchema = {
  fa: {
    type: 'number'
  }
};
const bl: ActionSchema<ValidatorSchema> = {
  params: {
    l: { type: 'string' }
  },
  handler(ctx) {
    ctx.params.l;
  }
};

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [service1.name]: typeof service1;
      [service2.name]: typeof service2;
      [service3.name]: typeof service3;
    }
  }
}
