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
  started() {
    if (!this.settings.acceptedTypes) {
      throw new Error(
        `The ClassDescriptionMixin must be used with the ControlledContainerMixin. No acceptedTypes setting defined.`
      );
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;

      await ctx.call('class-description.register', {
        type: Array.isArray(this.settings.acceptedTypes) ? this.settings.acceptedTypes[0] : this.settings.acceptedTypes,
        ...this.settings.classDescription,
        webId
      });
    }
  }
};
