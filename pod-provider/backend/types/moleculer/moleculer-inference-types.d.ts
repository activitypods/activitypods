/* eslint-disable max-classes-per-file */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable import/prefer-default-export */
/* eslint-disable lines-between-class-members */
/* eslint-disable no-dupe-class-members */

import type { EventEmitter2 } from 'eventemitter2';
import type { BinaryLike, CipherCCMTypes, CipherGCMTypes, CipherKey, CipherOCBTypes } from 'crypto';
import type { Worker } from 'cluster';
import type {
  ValidationRuleObject,
  ValidationSchema as FastestValidationSchema,
  ValidationSchemaMetaKeys
} from 'fastest-validator';
import { EnumType } from 'typescript';

// TODO: Add an explanation / introduction to this type declaration.
// What's not implemented yet:
// - inference of actions from mixins.
// - probably a lot more.

declare global {
  export namespace Moleculer {
    /*
     * # Schema DEFINITION TYPES
     */

    /** A schema like: `{p1: {type: "string"}, p2: {type: "boolean"}}` */
    // type ValidatorSchema = Record<
    //   string,
    //   ParameterSchema | ValidationRuleObject | ValidationRuleObject[] // Space for improvements.
    // > &
    //   ValidationSchemaMetaKeys;
    type ValidatorSchema = Record<string, ParameterSchema>;

    /** Schema of a single fastet-validator property, like `{type: "boolean", optional: true}` */
    type ParameterSchema<DefaultType extends any = never> = (
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
     * # Schema INFERENCE TYPES
     */

    /**
     * Infers the type of a fastest validator schema.
     * E.g.
     * ```ts
     * { param1: {type: "string"},
     *   param2: {type: "number"} }
     * ```
     * returns type `{ param1: string, param2: number}`
     */
    // type TypeFromSchema<Schema extends FastestValidationSchema | unknown> = Schema extends FastestValidationSchema
    //   ? {
    //       [Param in keyof Schema]: TypeFromSchemaParam<Schema[Param]>;
    //     }
    //   : never;

    type TypeFromSchema<Schema extends FastestValidationSchema | unknown> = Schema extends FastestValidationSchema
      ? Optionalize<{
          [Param in keyof Schema]: TypeFromSchemaParam<Schema[Param]>;
        }>
      : never;

    /**
     * Infers type from fastest-validator schema property definition.
     *
     * E.g.
     * - `{ type: "number", default: 2}` returns type `number | undefined`.
     * - `{ type: "array", items: "string"}` returns type `string[]`
     */
    type TypeFromSchemaParam<Param extends ParameterSchema> =
      // Base type inferred from the `type` property
      | TypeFromParsedParam<
          Param['type'],
          Param['items'], // 'items' extends keyof Param ? Extract<Param['items'], string>: undefined, // Present for arrays.
          Param['params'], // 'params' extends keyof Param ? Param['params']: undefined, // Present for objects.
          Param['rules'] // 'rules' extends keyof Param ? Param['rules']: undefined // Present for objects with multiple possible types.
        >
      // Include the type of `default` if it exists
      | (Param extends { default: infer D } ? (D & {}) | undefined : never)
      // Include `undefined` if `optional` is true
      | (Param extends { optional: true } ? undefined : never);

    /**
     * Infers the type from a fastest-validator string type, e.g.
     * the string `"number"` returns type `number`, `"boolean"` returns `boolean`.
     *
     * Supports complex types `"array"`, `"object"` or `"multi"` too. In that case,
     * provide the correct `"items"`, `"params"`, or `"rules"` schema.
     */
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
            ? TypeFromSchema<ObjectSchema>
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

    /**
     * Infers schema definitions from an array of schema properties ("multitype") into one type.
     * **Attention**: Using multi with more than one rule of type object fails.
     */
    type MultiType<ParameterSchemas extends ParameterSchema[] = []> = {
      [Index in keyof ParameterSchemas]: TypeFromSchemaParam<ParameterSchemas[Index]>;
    }[number];

    /** Get the parameter type of an action, if it exists. */
    type ParamTypeOfAction<Action extends ActionHandler | ActionSchema> = 'params' extends keyof Action
      ? TypeFromSchema<Action['params']>
      : unknown;

    /** Handler function from Handler (which can be a function or a action definitions). */
    type HandlerOfAction<Action extends ActionHandler | ActionSchema> = Action extends ActionHandler
      ? Action
      : 'handler' extends keyof Action
        ? Action['handler']
        : never;

    /*
     * # Moleculer Schemas
     */

    /**
     * Service registry that every service should extend
     * using global [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html)
     * as follow:
     * ```ts
     * const service = {
     *  name: 'service1',
     *  actions: {
     *    action1: defineAction({
     *      params: { stringParam: { type: 'string' } },
     *      async handler(ctx) {...}
     *    })
     *  }
     * };
     *
     * declare global {
     *   export namespace Moleculer {
     *     export interface AvailableServices {
     *       [service.name]: typeof service;
     *     }
     *   }
     * }
     * ```
     *
     */
    interface AllServices {}

    /**
     * Creates an object type in the format `{ serviceVersion.serviceName.actionName: Action }`
     * for a given service and action name. If the service has a version property, the version is prepended.
     */

    type ActionNameOfAction<
      const Service extends ServiceSchema,
      const ActionName extends readonly string,
      const Version = Service['version'] extends string
        ? `${Service['version']}.`
        : Service['version'] extends number
          ? `v${Service['version']}.`
          : ``
    > = `${Version}${`${Service['name']}.${ActionName}`}`;

    // Creates Record<action name, ServiceActionsSchema>
    type ActionsOfServices_<Services extends Record<string, ServiceSchema>> = {
      [ServiceKey in keyof Services]: {
        [ActionName in keyof Services[ServiceKey]['actions'] as ActionNameOfAction<
          Services[ServiceKey],
          ActionName & (string & {})
        >]: Services[ServiceKey]['actions'][ActionName];
      };
    }[keyof Services];

    /** Creates a type with the structure Record<`version.service.name`, ServiceActionsSchema>  */
    type ActionsOfServices<Services extends Record<string, ServiceSchema>> = UnionToIntersect<
      ActionsOfServices_<Services>
    >;

    /**
     * All available actions, inferred from @see {AllServices},
     * mapped by their full name like:
     * `Record<"[version.]serviceName.actionName": ServiceActionsSchema>`
     *
     */
    type AllActions = ActionsOfServices<AllServices>;

    /** The Action name of all available actions or `string`. */
    type ActionName = keyof AllActions | (string & {});

    type ActionSchema<
      const ParamSchema extends ValidatorSchema = ValidatorSchema,
      const Handler extends ActionHandler = ActionHandler<TypeFromSchema<ParamSchema>>, // See if this can be set differently / more openly for service schema's actions field
      // We need to preserve the return type for inference of the return type of handlers in `defineAction` methods.
      const Ret = ReturnType<Handler>
    > = {
      name?: string;
      visibility?: ActionVisibility;
      params?: ParamSchema;
      service?: Service;
      cache?: boolean | ActionCacheOptions;
      handler: Handler;
      tracing?: boolean | TracingActionOptions;
      bulkhead?: BulkheadOptions;
      circuitBreaker?: BrokerCircuitBreakerOptions;
      retryPolicy?: RetryPolicyOptions;
      fallback?: string | FallbackHandler;
      hooks?: ActionHooks;

      // See https://github.com/moleculerjs/moleculer/issues/467#issuecomment-705583471
      [key: string]: string | boolean | any[] | number | Record<any, any> | null | undefined;
    }; // ThisType<Service>?
    /**
     * Calls an action by name with appropriate parameter typing. For known actions, enforces correct parameter requirements;
     * for unknown action names, defaults to an unknown parameter type.
     *
     */
    type Call<Meta extends any = any> = <AName extends ActionName = ActionName, Action = AllActions[AName]>(
      actionName: AName,
      // Is specified action name "registered"?
      ...args: AName extends keyof AllActions
        ? HasAtLeastOneRequiredParam<Action> extends true
          ? // At least one param specified in action is required.
            [params: ParamTypeOfAction<Action>, opts?: CallingOptions<Meta>]
          : // All params are optional (or `params` property is missing for action).
            [params?: ParamTypeOfAction<Action>, opts?: CallingOptions<Meta>]
        : // Action is unknown
          [params?: Record<string, any>, opts?: CallingOptions<Meta>]
    ) => Promisify<AName extends keyof AllActions ? ReturnType<HandlerOfAction<Action>> : any>;

    /**
     * Dummy function that enforces type safety on `ActionSchema` definitions so that
     * you can use typed `ctx.params` inferred from the action's `params` property.
     */
    function defineAction<
      ParameterValidationSchema extends ValidatorSchema,
      Handler extends ActionHandler<TypeFromSchema<ParameterValidationSchema>> = ActionHandler<
        TypeFromSchema<ParameterValidationSchema>
      >,
      const Ret = ReturnType<Handler>
    >(
      schema: ActionSchema<ParameterValidationSchema, Handler, Ret> & ThisType<Service>
    ): ActionSchema<ParameterValidationSchema, Handler, Ret>;
    // function defineAction<const T>(val: T & ThisType<Service>): T;

    /**
     * Dummy function that enforces type safety on `ServiceEvent` definitions so that
     * you can use typed `ctx.params` inferred from the action's `params` property.
     */
    function defineServiceEvent<P extends ValidatorSchema>(schema: ServiceEvent<P>): ServiceEvent<P>;

    interface EventSchema<Schema extends FastestValidationSchema = {}> {
      name?: string;
      group?: string;
      params?: Schema;
      service?: Service;
      tracing?: boolean | TracingEventOptions;
      bulkhead?: BulkheadOptions;
      handler?: ActionHandler<TypeFromSchema<Schema>>;
      context?: boolean;

      [key: string]: any;
    }

    /** The actions of a service. */
    type ServiceActionsSchema<S = ServiceSettingSchema> = {
      // Adding type value Partial<ActionSchema> is a hack to support the typing of ctx.params inside of the handler. I don't fully understand why this works.
      // However that causes error message for the assignment
      [key: string]: ActionSchema | ActionHandler | boolean;
    } & ThisType<Service<S>>;

    class Context<
      Params extends Record<string, any> = Record<string, any>,
      Meta extends object = {},
      Locals = GenericObject
    > {
      constructor(broker: ServiceBroker, endpoint: Endpoint);

      id: string;
      broker: ServiceBroker;
      endpoint: Endpoint | null;
      action: ActionSchema | null;
      event: EventSchema | null;
      service: Service | null;
      nodeID: string | null;

      eventName: string | null;
      eventType: string | null;
      eventGroups: string[] | null;

      options: CallingOptions;

      parentID: string | null;
      caller: string | null;

      tracing: boolean | null;
      span: Span | null;

      needAck: boolean | null;
      ackID: string | null;

      locals: Locals;

      level: number;

      params: Params;
      meta: Meta;

      requestID: string | null;

      cachedResult: boolean;

      setEndpoint(endpoint: Endpoint): void;
      setParams(newParams: Params, cloning?: boolean): void;

      call: Call;
      mcall<T>(def: Record<string, MCallDefinition>, opts?: MCallCallingOptions): Promise<Record<string, T>>;
      mcall<T>(def: MCallDefinition[], opts?: MCallCallingOptions): Promise<T[]>;

      emit<D>(eventName: string, data: D, opts: GenericObject): Promise<void>;
      emit<D>(eventName: string, data: D, groups: string[]): Promise<void>;
      emit<D>(eventName: string, data: D, groups: string): Promise<void>;
      emit<D>(eventName: string, data: D): Promise<void>;
      emit(eventName: string): Promise<void>;

      broadcast<D>(eventName: string, data: D, opts: GenericObject): Promise<void>;
      broadcast<D>(eventName: string, data: D, groups: string[]): Promise<void>;
      broadcast<D>(eventName: string, data: D, groups: string): Promise<void>;
      broadcast<D>(eventName: string, data: D): Promise<void>;
      broadcast(eventName: string): Promise<void>;

      copy(endpoint: Endpoint): this;
      copy(): this;

      startSpan(name: string, opts?: GenericObject): Span;
      finishSpan(span: Span, time?: number): void;

      toJSON(): GenericObject;

      static create(broker: ServiceBroker, endpoint: Endpoint, params: GenericObject, opts: GenericObject): Context;
      static create(broker: ServiceBroker, endpoint: Endpoint, params: GenericObject): Context;
      static create(broker: ServiceBroker, endpoint: Endpoint): Context;
      static create(broker: ServiceBroker): Context;
    }

    // TODO: Documentation, Meta key
    // TODO: ThisType?
    type ActionHandler<
      Params extends Record<string, any> = Record<string, any>,
      ReturnType extends any = any,
      Meta extends object = {},
      Locals = Moleculer.GenericObject
    > = (ctx: Context<Params, Meta, Locals>) => ReturnType;

    interface ServiceSettingSchema {
      $noVersionPrefix?: boolean;
      $noServiceNamePrefix?: boolean;
      $dependencyTimeout?: number;
      $shutdownTimeout?: number;
      $secureSettings?: string[];
      [name: string]: any;
    }

    type ServiceEventLegacyHandler<Params = unknown> = (
      payload: any,
      sender: string,
      eventName: string,
      ctx: Context<Params>
    ) => (void | Promise<void>) & ThisType<Service>;

    type ServiceEventHandler<Params = unknown> = ((ctx: Context<Params>) => void | Promise<void>) & ThisType<Service>;

    interface ServiceEvent<Schema extends ValidatorSchema = {}> {
      name?: string;
      group?: string;
      params?: Schema;
      context?: boolean;
      debounce?: number;
      throttle?: number;
      handler?: ServiceEventHandler<TypeFromSchema<Schema>>; // | ServiceEventLegacyHandler<TypeFromSchema<Schema>>;
    }

    interface ServiceSchema<S = ServiceSettingSchema, T = Service<S>> {
      name: string;
      version?: string | number;
      settings?: S;
      dependencies?: string | ServiceDependency | (string | ServiceDependency)[];
      metadata?: any;
      actions?: ServiceActionsSchema<S>;
      mixins?: Partial<ServiceSchema>[];
      methods?: ServiceMethods;
      hooks?: ServiceHooks;

      events?: ServiceEvents;
      created?: ServiceSyncLifecycleHandler<S, T> | ServiceSyncLifecycleHandler<S, T>[];
      started?: ServiceAsyncLifecycleHandler<S, T> | ServiceAsyncLifecycleHandler<S, T>[];
      stopped?: ServiceAsyncLifecycleHandler<S, T> | ServiceAsyncLifecycleHandler<S, T>[];

      [name: string]: any;
    }

    type ServiceAction = <T = Promise<any>, P extends GenericObject = GenericObject>(
      params?: P,
      opts?: CallingOptions
    ) => T;

    interface ServiceActions {
      [name: string]: ServiceAction;
    }

    class ServiceBroker {
      constructor(options?: BrokerOptions);

      options: BrokerOptions;

      Promise: PromiseConstructorLike;
      ServiceFactory: typeof Service;
      ContextFactory: typeof Context;

      started: boolean;

      namespace: string;
      nodeID: string;
      instanceID: string;

      logger: LoggerInstance;

      services: Service[];

      localBus: EventEmitter2;

      scope: AsyncStorage;
      metrics: MetricRegistry;

      middlewares: MiddlewareHandler;

      registry: ServiceRegistry;

      cacher?: Cacher;
      serializer?: Serializer;
      validator?: BaseValidator;
      errorRegenerator?: Errors.Regenerator;

      tracer: Tracer;

      transit?: Transit;

      start(): Promise<void>;
      stop(): Promise<void>;

      errorHandler(err: Error, info: BrokerErrorHandlerInfo): void;

      wrapMethod(
        method: string,
        handler: ActionHandler,
        bindTo?: any,
        opts?: MiddlewareCallHandlerOptions
      ): typeof handler;
      callMiddlewareHookSync(name: string, args: any[], opts: MiddlewareCallHandlerOptions): Promise<void>;
      callMiddlewareHook(name: string, args: any[], opts: MiddlewareCallHandlerOptions): void;

      isMetricsEnabled(): boolean;
      isTracingEnabled(): boolean;

      getLogger(module: string, props?: GenericObject): LoggerInstance;
      fatal(message: string, err?: Error, needExit?: boolean): void;

      loadServices(folder?: string, fileMask?: string): number;
      loadService(filePath: string): Service;
      createService(schema: ServiceSchema, schemaMods?: Partial<ServiceSchema>): Service;
      destroyService(service: Service | string | ServiceSearchObj): Promise<void>;

      getLocalService(name: string | ServiceSearchObj): Service;
      waitForServices(
        serviceNames: (keyof AllServices | (string & {})) | (keyof AllServices | (string & {}))[] | ServiceSearchObj[],
        timeout?: number,
        interval?: number,
        logger?: LoggerInstance
      ): Promise<void>;

      findNextActionEndpoint(
        actionName: ActionName,
        opts?: GenericObject,
        ctx?: Context
      ): ActionEndpoint | Errors.MoleculerRetryableError;

      call: Call;
      mcall<T>(def: Record<string, MCallDefinition>, opts?: MCallCallingOptions): Promise<Record<string, T>>;
      mcall<T>(def: MCallDefinition[], opts?: MCallCallingOptions): Promise<T[]>;

      emit<D>(eventName: string, data: D, opts: GenericObject): Promise<void>;
      emit<D>(eventName: string, data: D, groups: string[]): Promise<void>;
      emit<D>(eventName: string, data: D, groups: string): Promise<void>;
      emit<D>(eventName: string, data: D): Promise<void>;
      emit(eventName: string): Promise<void>;

      broadcast<D>(eventName: string, data: D, opts: GenericObject): Promise<void>;
      broadcast<D>(eventName: string, data: D, groups: string[]): Promise<void>;
      broadcast<D>(eventName: string, data: D, groups: string): Promise<void>;
      broadcast<D>(eventName: string, data: D): Promise<void>;
      broadcast(eventName: string): Promise<void>;

      broadcastLocal<D>(eventName: string, data: D, opts: GenericObject): Promise<void>;
      broadcastLocal<D>(eventName: string, data: D, groups: string[]): Promise<void>;
      broadcastLocal<D>(eventName: string, data: D, groups: string): Promise<void>;
      broadcastLocal<D>(eventName: string, data: D): Promise<void>;
      broadcastLocal(eventName: string): Promise<void>;

      ping(): Promise<PongResponses>;
      ping(nodeID: string | string[], timeout?: number): Promise<PongResponse>;

      getHealthStatus(): NodeHealthStatus;
      getLocalNodeInfo(): BrokerNode;

      getCpuUsage(): Promise<any>;
      generateUid(): string;

      hasEventListener(eventName: string): boolean;
      getEventListener(eventName: string): EventEndpoint[];

      getConstructorName(obj: any): string;

      MOLECULER_VERSION: string;
      PROTOCOL_VERSION: string;
      [key: string]: any;

      static MOLECULER_VERSION: string;
      static PROTOCOL_VERSION: string;
      static INTERNAL_MIDDLEWARES: string[];
      static defaultOptions: BrokerOptions;
      static Promise: PromiseConstructorLike;
    }

    /*
     * # Utility Types
     */

    /** Converts a type union into a type intersection */
    type UnionToIntersect<T> = (T extends any ? (x: T) => 0 : never) extends (x: infer R) => 0 ? R : never;

    /** The following type wraps an object in a promise if it isn't one already. */
    type Promisify<T> = Promise<T extends Promise<infer U> ? U : T>;

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
  }

  /**
   * A helper type that takes an object and makes properties optional
   * if their type includes `undefined`.
   *
   * For example, for `{ a: string | undefined, b: string }`, it returns
   * `{ a?: string | undefined, b: string }`.
   */
  type Optionalize<T extends object> = {
    // Pick optional properties and make them optional
    [K in keyof T as undefined extends T[K] ? K : never]?: T[K];
  } & {
    // Pick required properties
    [K in keyof T as undefined extends T[K] ? never : K]: T[K];
  };
}

export = Moleculer;
