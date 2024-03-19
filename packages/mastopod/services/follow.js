const { ACTIVITY_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'mastopod.follow',
  dependencies: ['activity-mapping'],
  async started() {
    await this.broker.call('activity-mapping.addMapper', {
      match: {
        type: ACTIVITY_TYPES.FOLLOW
      },
      mapping: {
        key: 'follow',
        title: {
          en: `{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} is now following you`,
          fr: `{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} vous suit`
        },
        actionName: {
          en: 'View',
          fr: 'Voir'
        },
        actionLink: `https://mastopod.com/actor/{{encodeUri activity.actor}}`
      }
    });
  }
};
