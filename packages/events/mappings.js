const JOIN_EVENT_MAPPING = {
  key: 'join_event',
  title: {
    en: `{{emitterProfile.vcard:given-name}} joined your event "{{activity.object.name}}"`,
    fr: `{{emitterProfile.vcard:given-name}} s'est inscrit(e) à votre événement "{{activity.object.name}}"`
  },
  actionName: {
    en: 'View',
    fr: 'Voir'
  },
  actionLink: "{{activity.object.id}}"
};

const LEAVE_EVENT_MAPPING = {
  key: 'leave_event',
  title: {
    en: `{{emitterProfile.vcard:given-name}} left your event "{{activity.object.name}}"`,
    fr: `{{emitterProfile.vcard:given-name}} s'est désinscrit(e) de votre événement "{{activity.object.name}}"`
  },
  actionName: {
    en: 'View',
    fr: 'Voir'
  },
  actionLink: "{{activity.object.id}}"
};

const INVITE_EVENT_MAPPING = {
  key: 'invitation',
  title: {
    en: `{{emitterProfile.vcard:given-name}} invites you to an event "{{activity.object.name}}"`,
    fr: `{{emitterProfile.vcard:given-name}} vous invite à un événement "{{activity.object.name}}"`
  },
  actionName: {
    en: 'View',
    fr: 'Voir'
  },
  actionLink: "{{activity.object.id}}"
};

module.exports = {
  JOIN_EVENT_MAPPING,
  LEAVE_EVENT_MAPPING,
  INVITE_EVENT_MAPPING
};
