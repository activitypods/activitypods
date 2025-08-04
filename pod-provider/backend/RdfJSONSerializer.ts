const BaseSerializer = require('moleculer').Serializers.Base;

/**
 * Custom serializer which correctly handle RDF.js data model objects
 * Needed to be able to call the ldp.resource.patch action from the tests
 *
 * TODO Consider using the Avro serializer, which handles custom types
 * https://moleculer.services/docs/0.14/networking#Avro-serializer
 * https://github.com/mtth/avsc/wiki/Advanced-usage#logical-types
 *  */
class RdfJSONSerializer extends BaseSerializer {
  serialize(obj: any) {
    return Buffer.from(
      JSON.stringify(obj, (_, value) => {
        if (value && typeof value === 'object') {
          const proto = Object.getPrototypeOf(value);
          if (proto?.termType) {
            return {
              termType: proto.termType,
              ...value
            };
          }
        }
        return value;
      })
    );
  }

  deserialize(buf: any) {
    return JSON.parse(buf);
  }
}

export default RdfJSONSerializer;
