export default {
  dataModel: {
    types: ['apods:TrustedApps'],
    list: {
      servers: ['activitypods']
    },
    create: {
      // TODO check why this is necessary
      server: 'activitypods'
    }
  }
};