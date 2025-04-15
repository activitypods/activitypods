import { ValidationRuleObject, ValidationSchema, ValidationSchemaMetaKeys } from 'fastest-validator';
import { ServiceSchema, AvailableActions, AvailableServices } from 'moleculer';
import { EnumType } from 'typescript';

/*
 DEFINITION TYPES
*/

/** A schema like: `{p1: {type: "string"}, p2: {type: "boolean"}}` */
type ValidatorSchema = Record<
  string,
  ParameterSchema | ValidationRuleObject | ValidationRuleObject[] // Space for improvements.
> &
  ValidationSchemaMetaKeys;

/** Schema of a single parameter, like `{type: "boolean", optional: true}` */
type ParameterSchema<DefaultType extends any = undefined> = (
  | { optional?: true }
  | { default?: DefaultType } // TODO: Bind this to the allowable schema definitions.
) &
  (
    | { type: 'multi'; rules: ParameterSchema[] }
    | { type: 'object'; params: Record<string, ParameterSchema> }
    | { type: 'array'; items: keyof BasicValidatorTypeMap }
    | { type: keyof BasicValidatorTypeMap }
  );

/** A moleculer action definition */
type Action<Schema extends ValidatorSchema = {}, Ret extends any = unknown> = {
  params: Schema;
  handler: (ps: TypeOfSchema<Schema>) => Ret;
};

/*
 * # INFERENCE TYPES
 */

/** The object that is inferred from the schema. */
type TypeOfSchema<Schema extends ParameterSchema> = {
  [Param in keyof Schema]: TypeOfSchemaParam<Schema[Param]>;
};

/** Infers type from fastest-validator schema property definition. */
type TypeOfSchemaParam<Param extends ParameterSchema> =
  // Base type inferred from the `type` property
  | TypeFromParsedParam<
      Param['type'],
      Param['items'], // 'items' extends keyof Param ? Extract<Param['items'], string>: undefined, // Present for arrays.
      Param['params'], // 'params' extends keyof Param ? Param['params']: undefined, // Present for objects.
      Param['rules'] // 'rules' extends keyof Param ? Param['rules']: undefined // Present for objects with multiple possible types.
    >
  // Include the type of `default` if it exists
  | (Param extends { default: infer D } ? D & {} : never)
  // Include `undefined` if `optional` is true
  | (Param extends { optional: true } ? undefined : never);

/** Infers the type from a fastest-validator string type and processes array, object or multi parameters, if provided. */
type TypeFromParsedParam<
  T extends string, // The basic type as string.
  ItemTypeValue extends string = never, // If items property is present for array type.
  ObjectSchema extends ParameterSchema = never, // ...
  MultiTypeSchemas extends ParameterSchema[] = never // ...
> = T extends keyof BasicValidatorTypeMap
  ? BasicValidatorTypeMap[T]
  : T extends 'array'
    ? Array<TypeFromParsedParam<ItemTypeValue>>
    : T extends 'multi'
      ? MultiType<MultiTypeSchemas>
      : T extends 'object'
        ? TypeOfSchema<ObjectSchema>
        : never;

/** Fastest-validator types with primitive mapping.  */
type BasicValidatorTypeMap = {
  any: any;
  boolean: boolean;
  class: any;
  currency: string;
  custom: any;
  date: string;
  email: string;
  enum: EnumType;
  equal: any;
  forbidden: any;
  function: Function;
  luhn: string;
  mac: string;
  number: number;
  objectID: any;
  record: object;
  string: string;
  tuple: Array<unknown>;
  url: string;
  uuid: string;
};

/** Infers schema definitions from an array of schema properties into one type. */
type MultiType<T extends ParameterSchema[] = []> = {
  [K in keyof T]: TypeOfSchemaParam<T[K]>;
}[number];

// EXAMPLES
//
const smallSchema = {
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

function defineAction<Schema extends ValidatorSchema, Ret extends ReturnType<Action['handler']>>(
  action: Action<Schema, Ret>
): Action<Schema, Ret> {
  return action;
}

function defineService<Schema extends ServiceSchema>(schema: Schema): Schema {
  return schema;
}

// Test method instance
const method2 = defineAction({
  params: smallSchema,
  handler(params) {
    const stringParam = params.stringParam;

    const optionalParam = params.optionalParam;
    const optionalSure = optionalParam!;

    const defaultParam = params.defaultParam;
    const stringArrayParam = params.stringArrayParam;
    const stra = stringArrayParam[0];

    const objectParam = params.objectParam;
    objectParam.o1;

    const multiParam = params.multiParam;
    if (typeof multiParam !== 'string' && multiParam?.p1) {
      // Type p2 shoulnt be available
      multiParam.p2;
    }

    return 'string' as string | number;
  }
});

const service = defineService({
  name: 'service1',
  actions: {
    action1: {
      params: { stringParam: {} }
    }
  }
});

declare global {
  export namespace Moleculer {
    export interface AvailableServices {
      [service.name]: typeof service;
    }
  }
}

const service2 = defineService({
  name: 'service2',
  actions: {
    action2: {
      params: { stringParam: {} }
    }
  }
});

declare global {
  export namespace Moleculer {
    export interface AvailableServices {
      [service2.name]: typeof service2;
    }
  }
}


interface AvailableServices  {
  'pre-service-1': { name: 'pre-service-1'; actions: { preAction: { params: {}; handler: () => {} } } };
}

type keys = keyof AvailableActions<AvailableServices>;

let a:AvailableActions = {""}