import TagCreate from './TagCreate';
import TagEdit from './TagEdit';
import TagList from './TagList';

export default {
  config: {
    list: TagList,
    edit: TagEdit,
    create: TagCreate,
    recordRepresentation: 'vcard:label'
  },
  dataModel: {
    types: ['vcard:Group'],
    list: {
      servers: 'pod',
      blankNodes: ['vcard:hasMember']
    }
  },
  translations: {
    en: {
      name: 'Tag |||| Tags'
    },
    fr: {
      name: 'Étiquette |||| Étiquettes'
    }
  }
};
