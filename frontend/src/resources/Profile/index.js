import ProfileEdit from './ProfileEdit';

export default {
  config: {
    edit: ProfileEdit,
    options: {
      label: 'Profiles'
    }
  },
  dataModel: {
    types: ['vcard:Individual', 'as:Profile']
  },
  translations: {
    en: {
      name: 'Profile |||| Profiles',
      fields: {
        'vcard:given-name': 'Name',
        'vcard:family-name': 'Family name',
        'vcard:note': 'About you',
        'vcard:photo': 'Picture',
        'vcard:hasAddress': 'Home address'
      }
    },
    fr: {
      name: 'Profil |||| Profils',
      fields: {
        'vcard:given-name': 'Prénom',
        'vcard:family-name': 'Nom de famille',
        'vcard:note': 'En deux mots',
        'vcard:photo': 'Photo',
        'vcard:hasAddress': 'Adresse du domicile'
      }
    }
  }
};
