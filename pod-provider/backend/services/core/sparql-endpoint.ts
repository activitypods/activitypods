// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { SparqlEndpointService } from '@semapps/sparql-endpoint';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "sparqlEndpoint"; settings: { defaul... Remove this comment to see the full error message
  mixins: [SparqlEndpointService],
  settings: {
    podProvider: true,
    defaultAccept: 'application/ld+json'
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
