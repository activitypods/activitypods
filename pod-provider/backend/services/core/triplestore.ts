import { TripleStoreService } from '@semapps/triplestore';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [TripleStoreService],
  settings: {
    url: CONFIG.SPARQL_ENDPOINT,
    user: CONFIG.JENA_USER,
    password: CONFIG.JENA_PASSWORD,
    fusekiBase: CONFIG.FUSEKI_BASE
  }
};

export default Schema;
