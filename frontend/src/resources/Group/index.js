import GroupCreate from './GroupCreate';
import GroupEdit from './GroupEdit';
import GroupList from './GroupList';
import GroupIcon from '@mui/icons-material/Group';

export default {
  config: {
    list: GroupList,
    edit: GroupEdit,
    create: GroupCreate,
    icon: GroupIcon,
    options: {
      label: 'Group'
    }
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
      name: 'Group |||| Groups'
    },
    fr: {
      name: 'Groupe |||| Groupes'
    }
  }
};
