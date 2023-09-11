import ProfileCreate from './ProfileCreate';
import ProfileEdit from './ProfileEdit';
import ProfileList from './ProfileList';
import ProfileShow from './ProfileShow';

export default {
  config: {
    create: ProfileCreate,
    edit: ProfileEdit,
    list: ProfileList,
    show: ProfileShow,
    options: {
      label: 'Profiles',
    },
  },
  dataModel: {
    types: ['vcard:Individual', 'as:Profile'],
  },
  translations: {
    en: {
      name: 'Profile |||| Profiles',
      fields: {
        describes: 'User ID',
        'vcard:given-name': 'Surname',
        'vcard:family-name': 'Family name',
        'vcard:note': 'About you',
        'vcard:photo': 'Picture',
        'vcard:hasAddress': 'Home address',
        'foaf:tipjar': 'Ğ1 account',
        'dc:created': 'Account created',
      },
    },
    fr: {
      name: 'Profil |||| Profils',
      fields: {
        describes: 'Identifiant',
        'vcard:given-name': 'Prénom',
        'vcard:family-name': 'Nom de famille',
        'vcard:note': 'En deux mots',
        'vcard:photo': 'Photo',
        'vcard:hasAddress': 'Adresse du domicile',
        'foaf:tipjar': 'Compte Ğ1',
        'dc:created': "Date d'inscription",
      },
    },
  },
};
