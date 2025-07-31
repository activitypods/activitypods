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
  // @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
} from '@semapps/ontologies';

// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
  mixins: [OntologiesService],
  settings: {
    // TODO remove pair from core ontologies
    ontologies: [apods, interop, notify, oidc, solid, dc, pair, vcard, pim, voidOntology, did],
    persistRegistry: true,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
};
