const dataServers = {
  podProvider: {
    authServer: true,
    void: false,
    baseUrl: process.env.REACT_APP_POD_PROVIDER_URL
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
        'vcard:Group': ['/groups'],
        'interop:ApplicationRegistration': ['/app-registrations']
      }
    },
    uploadsContainer: '/files'
  },
  activitypods: {
    baseUrl: 'https://data.activitypods.org/',
    noProxy: true // HTTP signature is not supported on that server
  }
};

export default dataServers;
