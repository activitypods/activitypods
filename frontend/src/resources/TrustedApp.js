export default {
  dataModel: {
    types: ['apods:TrustedApps'],
    list: {
      servers: ['activitypods'],
      fetchContainer: true
    },
    create: {
      // TODO check why this is necessary
      server: 'activitypods'
    }
  }
};