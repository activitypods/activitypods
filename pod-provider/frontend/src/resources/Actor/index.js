import ActorShow from './ActorShow';

export default {
  config: {
    show: ActorShow,
    recordRepresentation: record => record.name || record.preferredUsername
  },
  dataModel: {
    types: ['as:Person', 'foaf:Person']
  },
  translations: {
    en: {
      name: 'Utilisateur |||| Utilisateurs',
      fields: {
        id: 'User ID',
        preferredUsername: 'User ID',
        name: 'Name',
        summary: 'About you',
        icon: 'Avatar',
        'dc:created': 'Account created'
      }
    },
    fr: {
      name: 'User |||| Users',
      fields: {
        id: 'Identifiant',
        preferredUsername: 'Identifiant',
        name: 'Nom',
        summary: 'En deux mots',
        icon: 'Avatar',
        'dc:created': "Date d'inscription"
      }
    }
  }
};
