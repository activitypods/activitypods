const dataServers = {
  pod: {
    pod: true,
    default: true,
    baseUrl: null, // Calculated from the token
    sparqlEndpoint: null,
    containers: {
      pod: {
        'vcard:Individual': ['/profiles']
      }
    },
    uploadsContainer: '/files'
  }
};

export default dataServers;
