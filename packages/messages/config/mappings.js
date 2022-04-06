const NEW_MESSAGE_MAPPING = {
  key: 'new_message',
  title: {
    en: `{{emitterProfile.vcard:given-name}} sent you a message`,
    fr: `{{emitterProfile.vcard:given-name}} vous a envoyé un message`
  },
  actionName: {
    en: 'Reply',
    fr: 'Répondre'
  },
  actionLink: "{{emitterProfile.@id}}"
};

module.exports = {
  NEW_MESSAGE_MAPPING
};
