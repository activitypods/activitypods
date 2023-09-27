import AppList from './AppList';

export default {
  config: {
    list: AppList
  },
  dataModel: {
    types: ['apods:FrontAppRegistration'],
    fieldsMapping: {
      title: 'apods:domainName'
    }
  },
  translations: {
    en: {
      name: 'Application |||| Applications'
    },
    fr: {
      name: 'Application |||| Applications'
    }
  }
};
