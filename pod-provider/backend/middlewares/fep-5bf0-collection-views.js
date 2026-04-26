'use strict';

const urlJoin = require('url-join');

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const FEP_CONTEXT = {
  fep: 'https://w3id.org/fep#',
  CollectionView: 'fep:CollectionView',
  CollectionViewPage: 'fep:CollectionViewPage',
  viewOf: 'fep:viewOf',
  filter: 'fep:filter',
  sort: 'fep:sort',
  inCollection: 'fep:inCollection',
  SortShape: 'fep:SortShape',
  InCollectionShape: 'fep:InCollectionShape',
  order: 'fep:order',
  Ascending: 'fep:Ascending',
  Descending: 'fep:Descending',
  sh: 'http://www.w3.org/ns/shacl#',
  PropertyShape: 'sh:PropertyShape',
  path: 'sh:path',
  hasValue: 'sh:hasValue',
  minCount: 'sh:minCount'
};

const ensureFepContext = value => {
  const contexts = toArray(value);
  if (contexts.some(v => isObject(v) && v.CollectionView === 'fep:CollectionView')) {
    return value;
  }
  return [...contexts, FEP_CONTEXT];
};

const Fep5bf0CollectionViewsMiddleware = baseUrl => ({
  name: 'Fep5bf0CollectionViewsMiddleware',

  localAction(next, action) {
    // Intercept ldp.api.get to short-circuit view URIs before WebACL runs.
    // At this point ctx.params contains both route params (username, slugParts)
    // AND query params (beforeEq, afterEq), so we can extract them all.
    if (action.name === 'ldp.api.get') {
      return async ctx => {
        const { username, slugParts } = ctx.params || {};
        if (!username || !slugParts) return next(ctx);

        // Build the full resource URI the same way ldp.api does
        const parts = Array.isArray(slugParts) ? slugParts : [slugParts];
        const resourceUri = urlJoin(baseUrl, username, ...parts);

        if (!resourceUri.includes('/streams/')) return next(ctx);

        // It's a view URI — short-circuit with our service
        const webId = ctx.meta.webId || 'anon';
        const beforeEq = ctx.params.beforeEq;
        const afterEq = ctx.params.afterEq;

        ctx.meta.$responseType = 'application/ld+json';

        try {
          // Add Link header for the view URI
          if (!ctx.meta.$responseHeaders) ctx.meta.$responseHeaders = {};
          ctx.meta.$responseHeaders.Link = await ctx.call('ldp.link-header.get', { uri: resourceUri });
        } catch {
          /* non-critical */
        }

        return ctx.call('fep-5bf0-collection-views.getView', { resourceUri, beforeEq, afterEq, webId });
      };
    }

    if (action.name !== 'activitypub.collection.get') return next;

    return async ctx => {
      if (!isObject(ctx.params) || typeof ctx.params.resourceUri !== 'string') {
        return next(ctx);
      }

      const resourceUri = ctx.params.resourceUri;
      const webId = ctx.params.webId || ctx.meta.webId || 'anon';
      const beforeEq = ctx.params.beforeEq || ctx.meta.queryString?.beforeEq;
      const afterEq = ctx.params.afterEq || ctx.meta.queryString?.afterEq;

      let isViewUri = false;
      try {
        isViewUri = await ctx.call('fep-5bf0-collection-views.isViewUri', { resourceUri });
      } catch {
        isViewUri = false;
      }

      if (isViewUri) {
        return ctx.call('fep-5bf0-collection-views.getView', {
          resourceUri,
          beforeEq,
          afterEq,
          webId
        });
      }

      const result = await next(ctx);

      if (!isObject(result)) return result;
      if (result.type !== 'Collection' && result.type !== 'OrderedCollection') return result;
      if (result.id !== resourceUri) return result;

      try {
        const streams = await ctx.call('fep-5bf0-collection-views.getStreamsForCollection', {
          collectionUri: resourceUri,
          webId
        });

        if (Array.isArray(streams) && streams.length > 0) {
          result.streams = streams;
          result['@context'] = ensureFepContext(result['@context']);
        }
      } catch (e) {
        ctx.service.logger.debug(`FEP-5bf0 streams enrichment skipped: ${e.message}`);
      }

      return result;
    };
  }
});

module.exports = Fep5bf0CollectionViewsMiddleware;
