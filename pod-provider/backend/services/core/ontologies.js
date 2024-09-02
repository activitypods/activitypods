const {
  OntologiesService,
  dc,
  syreen,
  mp,
  pair,
  void: voidOntology,
  interop,
  notify,
  oidc,
  solid,
  apods
} = require('@semapps/ontologies');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [OntologiesService],
  settings: {
    ontologies: [apods, interop, notify, oidc, solid, dc, syreen, mp, pair, voidOntology],
    persistRegistry: false,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
};
