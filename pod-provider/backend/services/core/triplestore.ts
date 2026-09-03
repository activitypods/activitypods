import { TripleStoreService } from '@semapps/triplestore';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [TripleStoreService],
  settings: {
    url: CONFIG.SPARQL_ENDPOINT,
    user: CONFIG.JENA_USER,
    password: CONFIG.JENA_PASSWORD,
    fusekiBase: CONFIG.FUSEKI_BASE
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
