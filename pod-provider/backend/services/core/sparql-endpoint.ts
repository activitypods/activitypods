import { SparqlEndpointService } from '@semapps/sparql-endpoint';

const Schema = {
  mixins: [SparqlEndpointService],
  settings: {
    podProvider: true,
    defaultAccept: 'application/ld+json'
  }
};

export default Schema;
