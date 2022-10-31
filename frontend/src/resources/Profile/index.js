import ProfileEdit from './ProfileEdit';
import ProfileList from './ProfileList';
import ProfileShow from './ProfileShow';

export default {
  config: {
    edit: ProfileEdit,
    list: ProfileList,
    show: ProfileShow,
    options: {
      label: 'Profiles',
    },
  },
  dataModel: {
    types: ['vcard:Individual'],
  },
  translations: {
    en: {
      name: 'Profile |||| Profiles',
      fields: {
        'vcard:given-name': 'Surname',
        'vcard:family-name': 'Family name',
        'vcard:note': 'About you',
        'vcard:photo': 'Picture'
      },
    },
    fr: {
      name: 'Profil |||| Profils',
      fields: {
        'vcard:given-name': 'Prénom',
        'vcard:family-name': 'Nom de famille',
        'vcard:note': 'En deux mots',
        'vcard:photo': 'Photo'
      },
    },
  },
};
