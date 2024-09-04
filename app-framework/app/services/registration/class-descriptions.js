const { ControlledContainerMixin, getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { skos } = require('@semapps/ontologies');

module.exports = {
  name: 'class-descriptions',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['apods:ClassDescription'],
    readOnly: true,
    excludeFromMirror: true,
    activateTombstones: false
  },
  async started() {
    await this.broker.call('ontologies.register', skos);
  },
  actions: {
    put() {
      throw new Error(`The resources of type apods:ClassDescription are immutable`);
    },
    patch() {
      throw new Error(`The resources of type apods:ClassDescription are immutable`);
    },
    async findExisting(ctx) {
      const { locale, type, label, labelPredicate, openEndpoint, icon } = ctx.params;

      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX apods: <http://activitypods.org/ns/core#>
          PREFIX interop: <http://www.w3.org/ns/solid/interop#>
          PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
          SELECT ?classDescription 
          WHERE {
            ?classDescription apods:describedClass <${type}> .
            ?classDescription skos:prefLabel "${label}" .
            ?classDescription apods:labelPredicate <${labelPredicate}> .
            ?classDescription apods:openEndpoint "${openEndpoint}" .
            ?classDescription apods:icon "${icon}" .
            ?classDescription a apods:ClassDescription .
            ?set apods:hasClassDescription ?classDescription .
            ?set interop:usesLanguage "${locale}"^^<http://www.w3.org/2001/XMLSchema#language>
          }
        `,
        accept: MIME_TYPES.JSON,
        webId: 'system'
      });

      return results[0]?.classDescription.value;
    }
  }
};
