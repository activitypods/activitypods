const { SparqlEndpointService } = require('@semapps/sparql-endpoint');

module.exports = {
  mixins: [SparqlEndpointService],
  settings: {
    podProvider: true,
    defaultAccept: 'application/ld+json'
  }
};
