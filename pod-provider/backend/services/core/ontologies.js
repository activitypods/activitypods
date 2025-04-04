const {
  OntologiesService,
  dc,
  did,
  pair,
  void: voidOntology,
  interop,
  notify,
  oidc,
  solid,
  apods,
  pim,
  vcard
} = require('@semapps/ontologies');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [OntologiesService],
  settings: {
    // TODO remove pair from core ontologies
    ontologies: [apods, interop, notify, oidc, solid, dc, pair, vcard, pim, voidOntology, did],
    persistRegistry: true,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
};
