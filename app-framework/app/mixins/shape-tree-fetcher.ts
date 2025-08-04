/**
 * Load the types associated with the shape tree
 */
module.exports = {
  settings: {
    shapeTreeUri: null,
    type: null
  },
  dependencies: ['shacl', 'shape-trees', 'jsonld.parser', 'jsonld.context'],
  async started() {
    if (!this.settings.type) {
      if (!this.settings.shapeTreeUri)
        throw new Error(`If the type setting is not set, the shapeTreeUri setting is required`);

      const shapeUri = await this.broker.call('shape-trees.getShapeUri', { resourceUri: this.settings.shapeTreeUri });
      const [fullType] = await this.broker.call('shacl.getTypes', { resourceUri: shapeUri });

      // We need to compact the types, because matchActivity doesn't handle yet full URIs
      const localContext = await this.broker.call('jsonld.context.get');
      const compactJson = await this.broker.call('jsonld.parser.compact', {
        input: { '@type': fullType },
        context: localContext
      });

      this.settings.type = compactJson.type;
    }
  }
};
