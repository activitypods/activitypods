import LocationCreate from './LocationCreate';
import LocationEdit from './LocationEdit';
import LocationList from './LocationList';
import PlaceIcon from '@material-ui/icons/Place';

export default {
  config: {
    create: LocationCreate,
    edit: LocationEdit,
    list: LocationList,
    icon: PlaceIcon,
    options: {
      label: 'Adresses',
    },
  },
  dataModel: {
    types: ['vcard:Location'],
    list: {
      servers: 'pod',
      dereference: ['vcard:hasAddress/vcard:hasGeo'],
    },
  },
  translations: {
    en: {
      name: 'Address |||| Addresses',
      fields: {
        'vcard:given-name': 'Name',
        'vcard:hasAddress': 'Address',
        'vcard:note': 'Comment',
      },
    },
    fr: {
      name: 'Adresse |||| Adresses',
      fields: {
        'vcard:given-name': 'Nom du lieu',
        'vcard:hasAddress': 'Adresse',
        'vcard:note': 'Indications',
      },
    },
  },
};
