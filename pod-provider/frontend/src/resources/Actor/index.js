import ActorShow from './ActorShow';

export default {
  config: {
    show: ActorShow
  },
  dataModel: {
    types: ['as:Person', 'foaf:Person']
  },
  translations: {
    en: {
      name: 'Utilisateur |||| Utilisateurs',
      fields: {
        id: 'User ID',
        'dc:created': 'Account created'
      }
    },
    fr: {
      name: 'User |||| Users',
      fields: {
        id: 'Identifiant',
        'dc:created': "Date d'inscription"
      }
    }
  }
};
