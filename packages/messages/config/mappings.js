const NEW_MESSAGE_MAPPING = {
  key: 'new_message',
  title: {
    en: `{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} sent you a message`,
    fr: `{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} vous a envoyé un message`
  },
  description: '{{removeHtmlTags activity.object.content}}',
  actionName: {
    en: 'Reply',
    fr: 'Répondre'
  },
  actionLink: '?type=as:Profile&uri={{encodeUri emitterProfile.id}}'
};

module.exports = {
  NEW_MESSAGE_MAPPING
};
