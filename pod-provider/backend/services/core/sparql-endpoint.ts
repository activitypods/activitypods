// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { SparqlEndpointService } from '@semapps/sparql-endpoint';

export default {
  mixins: [SparqlEndpointService],
  settings: {
    podProvider: true,
    defaultAccept: 'application/ld+json'
  }
};
