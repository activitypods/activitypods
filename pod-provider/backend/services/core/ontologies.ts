import {
  OntologiesService,
  dc,
  did,
  pair,
  void as voidOntology,
  interop,
  notify,
  oidc,
  solid,
  apods,
  pim,
  vcard
} from '@semapps/ontologies';

import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [OntologiesService],

  settings: {
    // TODO remove pair from core ontologies
    ontologies: [apods, interop, notify, oidc, solid, dc, pair, vcard, pim, voidOntology, did],
    persistRegistry: true,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
} satisfies ServiceSchema;

export default Schema;
