const fetch = require('node-fetch');
const ShexParser = require('@shexjs/parser');

const shexParser = ShexParser.construct();

module.exports = {
  name: 'shex',
  actions: {
    // Extract the required type from the ShEx shape.
    // This is a hack that will be removed when we stop using the class for the container path
    async getType(ctx) {
      const { shapeUri } = ctx.params;

      const response = await fetch(shapeUri, { headers: { Accept: 'text/shex' } });
      if (!response.ok) return false;

      const shexC = await response.text();
      const shexJ = shexParser.parse(shexC);

      const type = shexJ?.shapes?.[0]?.shapeExpr?.expression?.expressions.find(
        expr => expr.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
      )?.valueExpr?.values?.[0];

      return type;
    }
  }
};
