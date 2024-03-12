const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'access-description-set',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessDescriptionSet'],
    readOnly: true
  },
  actions: {
    async findByLocale(ctx) {
      const { locale, webId } = ctx.params;
      const descriptionSets = await this.actions.list({ webId }, { parentCtx: ctx });
      return descriptionSets['ldp:contains']?.find(set => set['interop:usesLanguage'] === locale);
    }
  }
};
