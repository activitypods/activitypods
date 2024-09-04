const {
  OntologiesService,
  dc,
  pair,
  void: voidOntology,
  interop,
  notify,
  oidc,
  solid,
  apods,
  vcard
} = require('@semapps/ontologies');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [OntologiesService],
  settings: {
    // TODO remove pair from core ontologies
    ontologies: [apods, interop, notify, oidc, solid, dc, pair, vcard, voidOntology],
    persistRegistry: true,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
};
