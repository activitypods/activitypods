import { SparqlEndpointService } from '@semapps/sparql-endpoint';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [SparqlEndpointService],
  settings: {
    podProvider: true,
    defaultAccept: 'application/ld+json'
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
