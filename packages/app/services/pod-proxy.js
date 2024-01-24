const formDataToString = require('formdata-to-string');

module.exports = {
  name: 'pod-proxy',
  dependencies: ['app'],
  actions: {
    async get(ctx) {
      const { resourceUri, actorUri } = ctx.params;

      const app = await ctx.call('app.get');

      const actor = await ctx.call('activitypub.actor.get', { actorUri });

      const proxyUrl = actor.endpoints?.proxyUrl;

      if (proxyUrl) {
        const formData = new FormData();

        formData.append('id', resourceUri);
        formData.append('method', 'GET');
        formData.append('headers', JSON.stringify({ accept: 'application/ld+json' }));

        const boundary = `----formdata-undici-0${`${Math.floor(Math.random() * 1e11)}`.padStart(11, '0')}`;

        const stringFormData = await formDataToString(formData, { boundary });

        const { body } = await ctx.call('signature.proxy.query', {
          url: proxyUrl,
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body: stringFormData,
          actorUri: app.id || app['@id']
        });

        return body;
      } else {
        return false;
      }
    }
  }
};
