const { ACTIVITY_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'syreen.alert',
  settings: {
    alertBotUri: null
  },
  dependencies: ['activity-mapping'],
  async started() {
    await this.broker.call('activity-mapping.addMapper', {
      match: {
        type: ACTIVITY_TYPES.ANNOUNCE,
        actor: this.settings.alertBotUri,
        object: {
          type: 'syreen:Offer'
        }
      },
      mapping: {
        key: 'alert',
        title: {
          en: `A new offer matches your alerts: "{{activity.object.syreen:label}}"`,
          fr: `Une nouvelle offre correspond à vos alertes: "{{activity.object.syreen:label}}"`
        },
        actionName: {
          en: 'View',
          fr: 'Voir'
        },
        actionLink: '?uri={{encodeUri activity.object.id}}'
      },
      priority: 2
    });
  }
};
