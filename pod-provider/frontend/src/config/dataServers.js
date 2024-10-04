const dataServers = {
  podProvider: {
    authServer: true,
    baseUrl: CONFIG.BACKEND_URL,
    void: false
  },
  pod: {
    pod: true,
    default: true,
    baseUrl: null, // Calculated from the token
    sparqlEndpoint: null,
    containers: {
      pod: {
        'vcard:Location': ['/vcard/location'],
        'vcard:Individual': ['/vcard/individual'],
        'vcard:Group': ['/vcard/group'],
        'interop:Application': ['/interop/application'],
        'interop:ApplicationRegistration': ['/interop/application-registration'],
        'interop:AccessGrant': ['/interop/access-grant'],
        'interop:DataGrant': ['/interop/data-grant'],
        'solid:TypeRegistration': ['/solid/type-registration'],
        'apods:ClassDescription': ['/apods/class-description']
      }
    },
    uploadsContainer: '/semapps/file'
  },
  activitypods: {
    baseUrl: 'https://activitypods.org/data/',
    containers: {
      activitypods: {
        'apods:PodProvider': ['/pod-providers'],
        'interop:Application': ['/trusted-apps']
      }
    },
    void: false,
    noProxy: true // HTTP signature is not supported on that server
  }
};

export default dataServers;
