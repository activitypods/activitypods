import AppList from './AppList';

export default {
  config: {
    list: AppList
  },
  dataModel: {
    types: ['apods:TrustedApps'],
    list: {
      servers: ['activitypods']
    },
    create: {
      // TODO check why this is necessary
      server: 'activitypods'
    }
  },
  translations: {
    en: {
      name: 'Application |||| Applications',
      fields: {
        'describes': 'User ID',
        'vcard:given-name': 'Surname',
        'vcard:family-name': 'Family name',
        'vcard:note': 'About you',
        'vcard:photo': 'Picture',
        'foaf:tipjar': 'Ğ1 account',
        'dc:created': 'Account created'
      },
    },
    fr: {
      name: 'Application |||| Applications',
      fields: {
        'describes': 'Identifiant',
        'vcard:given-name': 'Prénom',
        'vcard:family-name': 'Nom de famille',
        'vcard:note': 'En deux mots',
        'vcard:photo': 'Photo',
        'foaf:tipjar': 'Compte Ğ1',
        'dc:created': "Date d'inscription"
      },
    },
  },
};
