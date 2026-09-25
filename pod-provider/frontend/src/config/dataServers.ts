const dataServers = {
  podProvider: {
    authServer: true,
    baseUrl: CONFIG.BACKEND_URL
  },
  activitypods: {
    baseUrl: 'https://activitypods.org/data/',
    containers: [
      {
        server: 'activitypods',
        path: '/pod-providers',
        types: ['apods:PodProvider']
      },
      {
        server: 'activitypods',
        path: '/trusted-apps',
        types: ['interop:Application']
      }
    ],
    noProxy: true // HTTP signature is not supported on that server
  }
};

export default dataServers;
