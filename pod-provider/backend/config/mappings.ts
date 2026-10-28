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
      link: '/network/{{encodeUri emitter.id}}'
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
      link: '/network/{{encodeUri emitter.id}}'
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
      link: '/network/{{encodeUri emitter.id}}'
    }
  ]
};

const INVITE_TO_GROUP_MAPPING = {
  title: {
    en: `{{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}} invites you to join the group`,
    fr: `{{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}} vous invite à rejoindre le groupe`
  },
  content: {
    en: 'You can accept or reject this invitation from the group page.',
    fr: 'Vous pouvez accepter ou refuser cette invitation depuis la page du groupe.'
  },
  actions: [
    {
      caption: {
        en: 'View the invitation',
        fr: "Voir l'invitation"
      },
      link: '/network/{{encodeUri emitter.id}}'
    }
  ]
};

const REMOVED_FROM_GROUP_MAPPING = {
  title: {
    en: `You are no longer a member of {{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}}`,
    fr: `Vous ne faites plus partie du groupe {{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}}`
  },
  actions: [
    {
      caption: {
        en: 'View the group',
        fr: 'Voir le groupe'
      },
      link: '/network/{{encodeUri emitter.id}}'
    }
  ]
};

// Sent by the group to its admins, possibly on other servers
const JOIN_REQUEST_MAPPING = {
  title: {
    en: `{{#if requester.name}}{{{requester.name}}}{{else}}{{requester.preferredUsername}}{{/if}} would like to join {{#if group.name}}{{{group.name}}}{{else}}{{group.preferredUsername}}{{/if}}`,
    fr: `{{#if requester.name}}{{{requester.name}}}{{else}}{{requester.preferredUsername}}{{/if}} souhaite rejoindre le groupe {{#if group.name}}{{{group.name}}}{{else}}{{group.preferredUsername}}{{/if}}`
  },
  content: `{{activity.content}}`,
  actions: [
    {
      caption: {
        en: 'View the request',
        fr: 'Voir la demande'
      },
      link: '/group/{{group.webfingerId}}/members'
    }
  ]
};

const JOIN_ACCEPTED_MAPPING = {
  title: {
    en: `You are now a member of {{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}}`,
    fr: `Vous êtes maintenant membre du groupe {{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}}`
  },
  actions: [
    {
      caption: {
        en: 'View the group',
        fr: 'Voir le groupe'
      },
      link: '/network/{{encodeUri emitter.id}}'
    }
  ]
};

const JOIN_REJECTED_MAPPING = {
  title: {
    en: `Your request to join {{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}} has been rejected`,
    fr: `Votre demande pour rejoindre le groupe {{#if emitter.name}}{{{emitter.name}}}{{else}}{{emitter.preferredUsername}}{{/if}} a été refusée`
  }
};

export {
  CONTACT_REQUEST_MAPPING,
  ACCEPT_CONTACT_REQUEST_MAPPING,
  AUTO_ACCEPTED_CONTACT_REQUEST_MAPPING,
  INVITE_TO_GROUP_MAPPING,
  REMOVED_FROM_GROUP_MAPPING,
  JOIN_REQUEST_MAPPING,
  JOIN_ACCEPTED_MAPPING,
  JOIN_REJECTED_MAPPING
};
