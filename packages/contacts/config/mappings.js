const CONTACT_REQUEST_MAPPING = {
  title: {
    // Allow to override the title by setting a summary to the activity
    en: `{{#if activity.summary}}{{activity.summary}}{{else}}{{{emitterProfile.vcard:given-name}}} would like to connect with you{{/if}}`,
    fr: `{{#if activity.summary}}{{activity.summary}}{{else}}{{{emitterProfile.vcard:given-name}}} souhaiterait se connecter avec vous{{/if}}`
  },
  content: `{{activity.content}}`,
  actions: [
    {
      caption: {
        en: 'View',
        fr: 'Voir'
      },
      link: '/Profile/{{encodeUri emitterProfile.id}}/show'
    }
  ]
};

const AUTO_ACCEPTED_CONTACT_REQUEST_MAPPING = {
  title: {
    en: `{{{emitterProfile.vcard:given-name}}} accepted your contact request by invite link.`,
    fr: `{{{emitterProfile.vcard:given-name}}} a accepté votre demande de contact donnée par lien d'invitation.`
  },
  content: {
    en: `You're now connected with {{{emitterProfile.vcard:given-name}}}.`,
    fr: 'Vous êtes maintenant connectés à {{{emitterProfile.vcard:given-name}}}.'
  },
  actions: [
    {
      caption: {
        en: 'View',
        fr: 'Voir'
      },
      link: '/Profile/{{encodeUri emitterProfile.id}}/show'
    }
  ]
};

const ACCEPT_CONTACT_REQUEST_MAPPING = {
  title: {
    en: `{{{emitterProfile.vcard:given-name}}} is now part of your network`,
    fr: `{{{emitterProfile.vcard:given-name}}} fait maintenant partie de votre réseau`
  },
  content: {
    en: `{{{emitterProfile.vcard:given-name}}} has accepted your contact request`,
    fr: `{{{emitterProfile.vcard:given-name}}} a accepté votre demande de mise en relation`
  },
  actions: [
    {
      caption: {
        en: 'View',
        fr: 'Voir'
      },
      link: '/Profile/{{encodeUri emitterProfile.id}}/show'
    }
  ]
};

module.exports = {
  CONTACT_REQUEST_MAPPING,
  ACCEPT_CONTACT_REQUEST_MAPPING,
  AUTO_ACCEPTED_CONTACT_REQUEST_MAPPING
};
