import { TripleStoreService } from '@semapps/triplestore';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "triplestore"; settings: { url: null... Remove this comment to see the full error message
  mixins: [TripleStoreService],
  settings: {
    url: CONFIG.SPARQL_ENDPOINT,
    user: CONFIG.JENA_USER,
    password: CONFIG.JENA_PASSWORD,
    fusekiBase: CONFIG.FUSEKI_BASE
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
