const dataServers = {
  podProvider: {
    authServer: true,
    baseUrl: process.env.REACT_APP_POD_PROVIDER_URL,
  },
  pod: {
    pod: true,
    default: true,
    baseUrl: null, // Calculated from the token
    sparqlEndpoint: null,
    containers: {
      pod: {
        'vcard:Location': ['/locations'],
        'vcard:Individual': ['/profiles'],
      },
    },
    uploadsContainer: '/files',
  }
};

export default dataServers;
