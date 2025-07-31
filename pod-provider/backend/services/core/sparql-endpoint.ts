import { SparqlEndpointService } from '@semapps/sparql-endpoint';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [SparqlEndpointService],

  settings: {
    podProvider: true,
    defaultAccept: 'application/ld+json'
  }
} satisfies ServiceSchema;

export default ServiceSchema;
