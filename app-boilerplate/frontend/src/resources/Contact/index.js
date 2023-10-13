import ContactList from './ContactList';
import ContactShow from './ContactShow';

export default {
  config: {
    list: ContactList,
    show: ContactShow,
    options: {
      label: 'Contacts'
    }
  },
  dataModel: {
    types: ['vcard:Individual', 'as:Profile']
  },
  translations: {
    en: {
      name: 'Contact |||| Contacts',
      fields: {
        describes: 'User ID',
        'vcard:given-name': 'Surname',
        'vcard:family-name': 'Family name',
        'vcard:note': 'About you',
        'vcard:photo': 'Picture',
        'vcard:hasAddress': 'Home address',
        'dc:created': 'Account created'
      }
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
        'dc:created': "Date d'inscription"
      }
    }
  }
};
