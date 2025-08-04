/* eslint-disable lines-between-class-members */
/* eslint-disable max-classes-per-file */

import { CallingOptions, ServiceEvent, ServiceSchema, defineAction } from 'moleculer';

// Reproduction

interface AllServices {}
interface AllServices {
  S1: { name: 's1'; actions: { a1: (s1p: string) => 1.1 } };
}
interface AllServices {
  S2: { name: 's2'; actions: { a2: (s2p: string) => '2' } };
}
interface AllServices {
  S3: typeof S3;
}

const S3 = {
  name: 's3' as const,
  actions: {
    a3Action: defineAction({
      params: { a3p: { type: 'string' } },
      handler: async ctx => {
        const ps = ctx.params;

        const a3Result = await ctx.call('s3.a3Action', { a3p: 2 });

        return ps.a3p;
      }
    }),
    // @ts-expect-error TS(2448): Block-scoped variable 'a4Action' used before its d... Remove this comment to see the full error message
    a4Action
  }
} satisfies ServiceSchema;
//
//
// const a3Action = defineAction({
//   params: { a3p: { type: 'string' } },
//   handler: async ctx => {
//     const ps = ctx.params;

//     const a3Result = await ctx.call('s3.a4Action', { a3p: 2 });

//     return ps.a3p;
//   }
// });
const a4Action = defineAction({
  params: { a3p: { type: 'string' } },
  handler: async ctx => {
    const ps = ctx.params;
    const a3Result: string = await ctx.call('s3.a3Action', {});
    return 3;
  }
} as const);

//
//
// Service and Action Name things
type ServiceKey = keyof AllServices;
type ServiceName = AllServices[ServiceKey]['name'];

// @ts-expect-error TS(2344): Type 'AllServices' does not satisfy the constraint... Remove this comment to see the full error message
type AllActions = UnionToIntersect<ActionsOfServices<AllServices>>;
type ActionName = keyof AllActions;

type AllServices_ = {
  [S in (string & {}) & keyof AllServices]: AllServices[S];
};

type ActionNameOfAction<Service extends ServiceSchema, Action extends string> =
  // Version
  `${Service['version'] extends string ? `${Service['version']}.` : Service['version'] extends number ? `v${Service['version']}.` : ``}${
    // Service name
    `${Service['name']}.${
      // Action name
      Action
    }`
  }`;

// Creates Record<action name, ServiceActionsSchema>
type ActionsOfServices_<Services extends Record<string, ServiceSchema>> = {
  [SK in keyof Services]: {
    [A in keyof Services[SK]['actions'] as ActionNameOfAction<Services[SK], A & string>]: Services[SK]['actions'][A];
  };
}[keyof Services];

/** Creates a type with the structure Record<`version.service.name`, ServiceActionsSchema>  */
type ActionsOfServices<Services extends Record<string, ServiceSchema>> = Record<
  keyof ActionsOfServices_<Services>,
  ActionSchema | ActionHandler
> &
  UnionToIntersect<ActionsOfServices_<Services>>;

// Schemas
interface ServiceSchema<S = ServiceSettingSchema> {
  name: string;
  version?: string | number;
  settings?: S;
  actions?: ServiceActionsSchema;
  [name: string]: any;
}
type ServiceActionsSchema<S = ServiceSettingSchema> = {
  [key: string]: ActionSchema | ActionHandler | boolean;
} & ThisType<S>;

interface ServiceSettingSchema {
  [name: string]: any;
}
//
type Call<Meta extends any = any> = <AName extends ActionName = ActionName, Action = AllActions[AName]>(
  actionName: AName,
  ...args: AName extends keyof AllActions
    ? // @ts-expect-error TS(2344): Type 'Action' does not satisfy the constraint 'Act... Remove this comment to see the full error message
      HasAtLeastOneRequiredParam<Action> extends true
      ? // @ts-expect-error TS(2344): Type 'Action' does not satisfy the constraint 'Act... Remove this comment to see the full error message
        [params: ParamTypeOfAction<Action>, opts?: CallingOptions<Meta>]
      : // @ts-expect-error TS(2344): Type 'Action' does not satisfy the constraint 'Act... Remove this comment to see the full error message
        [params?: ParamTypeOfAction<Action>, opts?: CallingOptions<Meta>]
    : // @ts-expect-error TS(2344): Type 'Meta' does not satisfy the constraint 'Gener... Remove this comment to see the full error message
      [params?: Record<string, any>, opts?: CallingOptions<Meta>]
  // @ts-expect-error TS(2344): Type 'HandlerOfAction<Action>' does not satisfy th... Remove this comment to see the full error message
) => Promisify<AName extends keyof AllActions ? ReturnType<HandlerOfAction<Action>> : unknown>;

class Context<Params extends Record<string, any> = Record<string, any>> {
  // @ts-expect-error TS(2564): Property 'params' has no initializer and is not de... Remove this comment to see the full error message
  params: Params;
  // @ts-expect-error TS(2564): Property 'call' has no initializer and is not defi... Remove this comment to see the full error message
  call: Call;
}

/** A schema like: `{p1: {type: "string"}, p2: {type: "boolean"}}` */
type ValidatorSchema = Record<string, ParameterSchema>;

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

/*
 * # INFERENCE TYPES
 */

/** Infers the object type from a FastestValidator schema. */
type TypeFromSchema<Schema extends ValidatorSchema> = Schema extends ValidatorSchema
  ? {
      [Param in keyof Schema]: TypeFromSchemaParam<Schema[Param]>;
    }
  : never;

/** Infers type from fastest-validator schema property definition. */
type TypeFromSchemaParam<Param extends ParameterSchema> =
  // Base type inferred from the `type` property
  | TypeFromParsedParam<
      Param['type'],
      // @ts-expect-error TS(2344): Type 'Param["items"]' does not satisfy the constra... Remove this comment to see the full error message
      Param['items'], // 'items' extends keyof Param ? Extract<Param['items'], string>: undefined, // Present for arrays.
      // @ts-expect-error TS(2536): Type '"params"' cannot be used to index type 'Para... Remove this comment to see the full error message
      Param['params'], // 'params' extends keyof Param ? Param['params']: undefined, // Present for objects.
      // @ts-expect-error TS(2536): Type '"rules"' cannot be used to index type 'Param... Remove this comment to see the full error message
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
        ? // @ts-expect-error TS(2344): Type 'ObjectSchema' does not satisfy the constrain... Remove this comment to see the full error message
          TypeFromSchema<ObjectSchema>
        : never;

/** Fastest-validator types with primitive mapping.  */
// When making this extend Record<string, any>, TS is running into weird recursions.
interface BasicValidatorTypeMap {
  any: any;
  boolean: boolean;
  class: any;
  currency: string;
  custom: any;
  date: string;
  email: string;
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
}

/** Infers schema definitions from an array of schema properties into one type. */
type MultiType<ParameterSchemas extends ParameterSchema[] = []> = {
  [Index in keyof ParameterSchemas]: TypeFromSchemaParam<ParameterSchemas[Index]>;
}[number];

/** Converts a type union into a type intersection */
type UnionToIntersect<T> = (T extends any ? (x: T) => 0 : never) extends (x: infer R) => 0 ? R : never;

/** The following type wraps an object in a promise if it isn't one already. */
type Promisify<O> = O extends Promise<any> ? O : Promise<O>;

/** Get the parameter type of an action, if it exists. */
type ParamTypeOfAction<Action extends ActionHandler | ActionSchema> = 'params' extends keyof Action
  ? // @ts-expect-error TS(2344): Type 'Action["params"]' does not satisfy the const... Remove this comment to see the full error message
    TypeFromSchema<Action['params']>
  : unknown;

/** Handler function from Handler (which can be a function or a action definitions). */
type HandlerOfAction<Action extends ActionHandler | ActionSchema> = Action extends ActionHandler
  ? Action
  : 'handler' extends keyof Action
    ? Action['handler']
    : never;

//
// Call Functions

/** Helper to check if an object type has at least one non-optional property. */
type HasRequiredKeys<T> = [
  keyof {
    // Pick only keys that do not include undefined in their type.
    [K in keyof T as undefined extends T[K] ? never : K]: T[K];
  }
] extends [never]
  ? false
  : true;

/** Decides if an action has at least one required (non-optional) param. */
type HasAtLeastOneRequiredParam<A extends ActionHandler | ActionSchema> =
  ParamTypeOfAction<A> extends infer P
    ? [unknown] extends [P]
      ? false
      : [keyof P] extends [never]
        ? false
        : HasRequiredKeys<P>
    : false;

/**
 * Infers the parameter type required by a given action. If the action requires at least one parameter,
 * it is mandatory; otherwise, it is optional.
 */
type ParamOfAction<A extends ActionSchema | ActionHandler> =
  HasAtLeastOneRequiredParam<A> extends true ? ParamTypeOfAction<A> : ParamTypeOfAction<A> | undefined;

// To make the return type of ActionHandlerFn be inferred at call-time, you can remove the explicit R parameter from the function definition and let TypeScript infer it from the function implementation or usage.
// Alternatively, you can use a generic function signature and let the type be inferred from the return statement.

/**
 * A version of the Context for action handlers that breaks the recursive type dependency.
 * It omits the fully typed `call` method, which depends on `AllActions`.
 * The runtime `ctx` object will still have the typed `call` method.
 */
// @ts-expect-error TS(2344): Type 'P' does not satisfy the constraint 'Record<s... Remove this comment to see the full error message
type HandlerContext<P = unknown> = Omit<Context<P>, 'call'> & {
  call: <AName extends string = string>(actionName: AName, params?: any, opts?: CallingOptions) => Promise<any>;
};

type ActionHandler<Params extends Record<string, any> = Record<string, any>> = (ctx: HandlerContext<Params>) => any;

// ActionSchema base interface for explicit properties
interface ActionSchemaBase<
  ParamSchema extends ValidatorSchema = ValidatorSchema,
  Handler extends ActionHandler<TypeFromSchema<ParamSchema>> = ActionHandler<TypeFromSchema<ParamSchema>>
> {
  name?: string;
  params?: ParamSchema;
  handler: Handler;
}

// ActionSchema type with mapped type for extra properties (excluding 'params')
type ActionSchema<
  ParamSchema extends ValidatorSchema = ValidatorSchema,
  Handler extends ActionHandler<TypeFromSchema<ParamSchema>> = ActionHandler<TypeFromSchema<ParamSchema>>
> = ActionSchemaBase<ParamSchema, Handler> & {
  // See https://github.com/moleculerjs/moleculer/issues/467#issuecomment-705583471
  [key: string]: string | boolean | any[] | number | Record<any, any> | null | undefined;
};

// @ts-expect-error TS(2391): Function implementation is missing or not immediat... Remove this comment to see the full error message
function defineAction<Schema extends ValidatorSchema, Handler extends ActionHandler<TypeFromSchema<Schema>>>(
  schema: ActionSchema<Schema, Handler>
): ActionSchema<Schema, Handler>;

// @ts-expect-error TS(2391): Function implementation is missing or not immediat... Remove this comment to see the full error message
function defineServiceEvent<P extends ValidatorSchema>(schema: ServiceEvent<P>): ServiceEvent<P>;
