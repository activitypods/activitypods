import GroupCreate from './GroupCreate';
import GroupEdit from './GroupEdit';
import GroupList from './GroupList';
import GroupIcon from '@material-ui/icons/Group';

export default {
  config: {
    list: GroupList,
    edit: GroupEdit,
    create: GroupCreate,
    icon: GroupIcon,
    options: {
      label: 'Group',
    },
  },
  dataModel: {
    types: ['vcard:Group'],
    list: {
      servers: 'pod',
      //containers: { pod: ['/groups'] },
      blankNodes: ['vcard:hasMember'],
    },
  },
  translations: {
    en: {
      name: 'Group |||| Groups',
      fields: {
        'vcard:label': 'Name',
      },
    },
    fr: {
      name: 'Adresse |||| Adresses',
      fields: {
        'vcard:given-name': 'Nom du lieu',
      },
    },
  },
};
