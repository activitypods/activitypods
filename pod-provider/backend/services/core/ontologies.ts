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

// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "ontologies"; settings: { ontologies... Remove this comment to see the full error message
  mixins: [OntologiesService],
  settings: {
    // TODO remove pair from core ontologies
    ontologies: [apods, interop, notify, oidc, solid, dc, pair, vcard, pim, voidOntology, did],
    persistRegistry: true,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
