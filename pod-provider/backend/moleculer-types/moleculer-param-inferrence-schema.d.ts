type BasicType = 'string' | 'boolean' | 'number' | 'array' | 'object';
type TypeFromString<T extends string> = T extends 'string'
  ? string
  : T extends 'boolean'
    ? boolean
    : T extends 'number'
      ? number
      : T extends 'array' // TODO: Infer array type from `items` parameter.
        ? Array<unknown>
        : T extends 'object'
          ? object
          : T extends 'multi'
            ? object
            : never;

// Define validator schema
// TODO: Type ParameterDefinition validation with default
type ValidatorSchemaProp = { optional?: true } & { default?: unknown } & (
    | { type: 'multi'; rules: ValidatorSchemaProp[] }
    | { type: 'object'; params: ValidatorSchemaProp }
    | { type: 'array'; items: BasicType | 'object' }
    | { type: Exclude<BasicType, 'array' | 'object'> }
  );

// TODO: Support default and optional as well. There is something wrong adding the conditionals.
// | (Prop['default'] extends unknown ? Prop['default'] : never)
// | (Prop['optional'] extends true ? undefined : never);
type TypeFromSchemaProp<Prop extends ValidatorSchemaProp> =
  // Base type inferred from the `type` property
  TypeFromString<Prop['type']>;
//  // Include the type of `default` if it exists
//  | (Prop extends { default: infer D } ? D : never)
//  // Include `undefined` if `optional` is true
//  | (Prop extends { optional: true;  } ? undefined : never);

// A schema like: {p1: {type: "string"}, p2: {type: "boolean"}}
type ValidatorSchema = Record<string, ValidatorSchemaProp>;

// The object that is checked by the schema.
type ParameterObject<Schema extends ValidatorSchema> = {
  [Property in keyof Schema]: TypeFromSchemaProp<Schema[Property]>;
};

// A method
type Method<Schema extends ValidatorSchema> = {
  params: Schema;
  handler: (ps: ParameterObject<Schema>) => void;
};

// EXAMPLES
//
const smallSchema = {
  stringParam: { type: 'string', default: true, optional: true }
} as const;

const bigSchema = {
  resourceUri: { type: 'string' },
  webId: { type: 'string', optional: true },
  accept: { type: 'string', optional: true },
  jsonContext: {
    type: 'multi',
    rules: [{ type: 'array' }, { type: 'object' }, { type: 'string' }],
    optional: true
  },
  aclVerified: { type: 'boolean', optional: true }
};

type StringType = TypeFromSchemaProp<typeof smallSchema.stringParam>;

const method1: Method<typeof smallSchema> = {
  params: smallSchema,
  handler(params) {
    // Has type `unknown` but should be `string`
    const stringParam = params.stringParam;
    const l = typeof stringParam;
  }
};

function defineMethod<Schema extends ValidatorSchema>(method: Method<Schema>): Method<Schema> {
  return method;
}
// Test method instance
const method2 = defineMethod({
  params: { p1: { type: 'boolean', optional: true } },
  handler(params) {}
});
