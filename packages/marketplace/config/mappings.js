const NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST_MAPPING = {
  key: 'new_message_about_offer_or_request',
  title: {
    en: `{{emitterProfile.vcard:given-name}} writes you about "{{activity.object.context.pair:label}}"`,
    fr: `{{emitterProfile.vcard:given-name}} vous écrit au sujet de "{{activity.object.context.pair:label}}"`,
  },
  description: '{{activity.object.content}}',
  actionName: {
    en: 'Reply',
    fr: 'Répondre',
  },
  actionLink: '/Profile/{{encodeUri emitterProfile.id}}/show',
};

module.exports = {
  NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST_MAPPING,
};
