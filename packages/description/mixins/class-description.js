// To be used with ControlledContainerMixin

module.exports = {
  settings: {
    classDescription: {
      label: {},
      labelPredicate: undefined,
      openEndpoint: undefined
    }
  },
  dependencies: ['class-description'],
  async started() {
    if (!this.settings.acceptedTypes) {
      throw new Error(
        `The ClassDescriptionMixin must be used with the ControlledContainerMixin. No acceptedTypes setting defined.`
      );
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;

      const userData = await ctx.call('ldp.resource.awaitCreateComplete', {
        resourceUri: webId,
        predicates: ['schema:knowsLanguage']
      });

      // Register only the ClassDescription with the user locale
      const userLocale = userData['schema:knowsLanguage'];
      const label = this.settings.classDescription.label[userLocale]
        ? {
            [userLocale]: this.settings.classDescription.label[userLocale]
          }
        : { en: this.settings.classDescription.label.en };

      await ctx.call('class-description.register', {
        type: Array.isArray(this.settings.acceptedTypes) ? this.settings.acceptedTypes[0] : this.settings.acceptedTypes,
        label,
        labelPredicate: this.settings.classDescription.labelPredicate,
        openEndpoint: this.settings.classDescription.openEndpoint,
        webId
      });
    }
  }
};
