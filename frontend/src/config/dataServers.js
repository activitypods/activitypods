const dataServers = {
  podProvider: {
    authServer: true,
    baseUrl: process.env.REACT_APP_POD_PROVIDER_URL,
    void: false
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
        'apods:FrontAppRegistration': ['/front-apps'],
        'vcard:Group': ['/groups'],
        'acl:Authorization': ['/capabilities']
      }
    },
    uploadsContainer: '/files'
  },
  activitypods: {
    baseUrl: process.env.ACTIVITYPODS_COMMON_CONF_URL || 'https://data.activitypods.org/',
    noProxy: true // HTTP signature is not supported on that server
  }
};

export default dataServers;
