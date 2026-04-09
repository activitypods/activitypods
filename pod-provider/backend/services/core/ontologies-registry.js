const { OntologiesRegistryService } = require('@semapps/ontologies');

module.exports = {
  // Don't specify name/dependencies - the mixin provides them
  mixins: [OntologiesRegistryService]
};
