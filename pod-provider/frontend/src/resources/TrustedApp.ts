export default {
  dataModel: {
    types: ['interop:Application'],
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
