const { arrayOf } = require('@semapps/ldp');
const fetch = require('node-fetch');

/**
 * Load the types associated with the shape tree
 */
module.exports = {
  settings: {
    shapeTreeUri: null,
    types: null
  },
  dependencies: ['shacl', 'shape-trees', 'jsonld.parser', 'jsonld.context'],
  async started() {
    if (!this.settings.shapeTreeUri) throw new Error(`The shapeTreeUri setting is required`);

    if (!this.settings.types) {
      const shapeUri = await this.broker.call('shape-trees.getShapeUri', { resourceUri: this.settings.shapeTreeUri });
      const fullTypes = await this.broker.call('shacl.getTypes', { resourceUri: shapeUri });

      // We need to compact the types, because matchActivity doesn't handle yet full URIs
      const localContext = await this.broker.call('jsonld.context.get');
      const compactJson = await this.broker.call('jsonld.parser.compact', {
        input: { '@type': fullTypes },
        context: localContext
      });

      this.settings.types = arrayOf(compactJson.type);
    }
  }
};
