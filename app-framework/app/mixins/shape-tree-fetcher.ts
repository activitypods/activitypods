import { ServiceSchema } from 'moleculer';

/**
 * Load the types associated with the shape tree
 */
const Schema = {
  settings: {
    shapeTreeUri: null,
    type: null
  },
  dependencies: ['shacl', 'shape-trees', 'jsonld.parser', 'jsonld.context'],
  async started() {
    // @ts-expect-error TS(2339): Property 'settings' does not exist on type 'void'.
    if (!this.settings.type) {
      // @ts-expect-error TS(2339): Property 'settings' does not exist on type 'void'.
      if (!this.settings.shapeTreeUri)
        throw new Error(`If the type setting is not set, the shapeTreeUri setting is required`);

      // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
      const shapeUri = await this.broker.call('shape-trees.getShapeUri', { resourceUri: this.settings.shapeTreeUri });
      // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
      const [fullType] = await this.broker.call('shacl.getTypes', { resourceUri: shapeUri });

      // We need to compact the types, because matchActivity doesn't handle yet full URIs
      // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
      const localContext = await this.broker.call('jsonld.context.get');
      // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
      const compactJson = await this.broker.call('jsonld.parser.compact', {
        input: { '@type': fullType },
        context: localContext
      });

      // @ts-expect-error TS(2339): Property 'settings' does not exist on type 'void'.
      this.settings.type = compactJson.type;
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
