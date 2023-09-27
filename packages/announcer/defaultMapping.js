const defaultMapping = {
  key: 'announce',
  title: {
    en: `{{{emitterProfile.vcard:given-name}}} shared with you "{{{activity.object.name}}}"`,
    fr: `{{{emitterProfile.vcard:given-name}}} a partagé avec vous "{{{activity.object.name}}}"`
  },
  actionName: {
    en: 'View',
    fr: 'Voir'
  },
  actionLink: '?uri={{encodeUri activity.object.id}}'
};

module.exports = defaultMapping;
