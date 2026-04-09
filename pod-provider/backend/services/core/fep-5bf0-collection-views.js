'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const { MoleculerError } = require('moleculer').Errors;

const DESC_ORDER = 'http://semapps.org/ns/core#DescOrder';
const ASC_ORDER = 'http://semapps.org/ns/core#AscOrder';
const FALLBACK_ITEMS_PER_PAGE = 20;

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

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const normalizeString = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseDateValue = value => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const sameValue = (left, right) => {
  if (left === right) return true;
  if (typeof left === 'string' && typeof right === 'string') return left === right;
  return String(left) === String(right);
};

const extractDatasetFromUri = uri => {
  if (typeof uri !== 'string' || !uri.startsWith('http')) return undefined;
  try {
    const pathname = new URL(uri).pathname;
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] || undefined;
  } catch {
    return undefined;
  }
};

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
  name: 'fep-5bf0-collection-views',
  dependencies: ['activitypub.collection', 'activitypub.actor', 'triplestore', 'ldp.resource'],

  actions: {
    isViewUri: {
      params: {
        resourceUri: { type: 'string' }
      },
      handler(ctx) {
        return Boolean(this.parseViewResourceUri(ctx.params.resourceUri));
      }
    },

    getStreamsForCollection: {
      params: {
        collectionUri: { type: 'string' },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const webId = ctx.params.webId || ctx.meta.webId || 'anon';
        const assembled = await this.assembleCollectionViews(ctx, {
          collectionUri: ctx.params.collectionUri,
          webId
        });

        return assembled.views.map(view => ({
          id: view.id,
          type: 'CollectionView',
          name: view.name,
          filter: view.filter,
          sort: view.sort,
          totalItems: view.totalItems,
          first: view.first,
          last: view.last,
          viewOf: view.viewOf
        }));
      }
    },

    getView: {
      params: {
        resourceUri: { type: 'string' },
        beforeEq: { type: 'string', optional: true },
        afterEq: { type: 'string', optional: true },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const parsed = this.parseViewResourceUri(ctx.params.resourceUri);
        if (!parsed) {
          throw new MoleculerError('Not found', 404, 'NOT_FOUND');
        }

        const webId = ctx.params.webId || ctx.meta.webId || 'anon';
        const assembled = await this.assembleCollectionViews(ctx, {
          collectionUri: parsed.collectionUri,
          webId
        });

        const targetView = assembled.views.find(view => view.slug === parsed.slug);
        if (!targetView) {
          throw new MoleculerError('Not found', 404, 'NOT_FOUND');
        }

        const beforeEq = ctx.params.beforeEq || ctx.meta.queryString?.beforeEq;
        const afterEq = ctx.params.afterEq || ctx.meta.queryString?.afterEq;

        if (beforeEq && afterEq) {
          throw new MoleculerError('Cannot get a collection with both beforeEq and afterEq', 400, 'BAD_REQUEST');
        }

          const page = this.buildCollectionViewPage({
          view: targetView,
          beforeEq,
          afterEq
        });

        return await this.compactJsonLd(ctx, page);
      }
    }
  },

  methods: {
    parseViewResourceUri(resourceUri) {
      if (typeof resourceUri !== 'string') return null;
      const marker = '/streams/';
      const markerIndex = resourceUri.indexOf(marker);
      if (markerIndex === -1) return null;

      const collectionUri = resourceUri.slice(0, markerIndex);
      const slug = normalizeString(resourceUri.slice(markerIndex + marker.length));
      if (!collectionUri || !slug) return null;

      return { collectionUri, slug };
    },

    async compactJsonLd(ctx, input) {
      const localContext = await ctx.call('jsonld.context.get');
      const mergedContext = this.ensureFepContext(localContext);

      return ctx.call('jsonld.parser.compact', {
        input,
        context: mergedContext
      });
    },

    ensureFepContext(existingContext) {
      const values = toArray(existingContext);
      if (values.some(v => isObject(v) && v.CollectionView === 'fep:CollectionView')) {
        return existingContext;
      }
      return [...values, FEP_CONTEXT];
    },

    async assembleCollectionViews(ctx, { collectionUri, webId }) {
      const owner = await this.resolveCollectionOwner(ctx, collectionUri);
      const definitions = this.getStaticViewDefinitions({ collectionUri, owner });
      if (definitions.length === 0) {
        return { collectionUri, views: [] };
      }

      const materialized = await this.materializeCollectionItems(ctx, { collectionUri, webId });

      const views = [];
      for (const definition of definitions) {
        const filtered = await this.applyViewDefinition(ctx, {
          definition,
          sourceItems: materialized.items,
          webId
        });

        const viewUri = `${collectionUri}/streams/${definition.slug}`;
        const orderedItems = this.sortItems(filtered, definition.sort).map(item => ({
          ...item,
          __viewId: viewUri
        }));
        const itemUris = orderedItems.map(item => item.__itemUri).filter(Boolean);
        const itemsPerPage = materialized.options.itemsPerPage || FALLBACK_ITEMS_PER_PAGE;
        const firstCursor = itemUris[0];
        const lastCursor = itemUris[itemUris.length - 1];

        views.push({
          id: viewUri,
          slug: definition.slug,
          name: definition.name,
          filter: definition.filter,
          sort: definition.sort,
          viewOf: collectionUri,
          totalItems: orderedItems.length,
          first: firstCursor ? `${viewUri}?afterEq=${encodeURIComponent(firstCursor)}` : undefined,
          last: lastCursor ? `${viewUri}?beforeEq=${encodeURIComponent(lastCursor)}` : undefined,
          itemsPerPage,
          orderedItems,
          orderedItemUris: itemUris
        });
      }

      return { collectionUri, views };
    },

    async resolveCollectionOwner(ctx, collectionUri) {
      const maybeInbox = /\/inbox\/?$/.test(collectionUri);
      const maybeOutbox = /\/outbox\/?$/.test(collectionUri);
      if (!maybeInbox && !maybeOutbox) return null;

      try {
        return await ctx.call('activitypub.collection.getOwner', {
          collectionUri,
          collectionKey: maybeInbox ? 'inbox' : 'outbox'
        });
      } catch {
        return null;
      }
    },

    getStaticViewDefinitions({ collectionUri, owner }) {
      const isInbox = /\/inbox\/?$/.test(collectionUri);
      if (!isInbox) return [];

      const ownerUri = normalizeString(owner);
      const coworkersCollection = ownerUri ? `${ownerUri}/friends/coworkers` : null;

      const definitions = [
        {
          slug: 'likes',
          name: 'Likes',
          filter: {
            type: 'PropertyShape',
            path: 'type',
            hasValue: 'Like'
          },
          sort: {
            type: 'SortShape',
            path: 'published',
            order: 'Descending'
          }
        },
        {
          slug: 'posts-with-replies',
          name: 'Posts with Replies',
          filter: [
            {
              type: 'PropertyShape',
              path: 'type',
              hasValue: 'Create'
            },
            {
              type: 'PropertyShape',
              path: ['object', 'inReplyTo'],
              minCount: 1
            }
          ],
          sort: {
            type: 'SortShape',
            path: 'published',
            order: 'Descending'
          }
        }
      ];

      if (coworkersCollection) {
        definitions.push({
          slug: 'notes-by-coworkers',
          name: 'Posts by Co-Workers',
          filter: {
            type: 'InCollectionShape',
            path: 'actor',
            inCollection: coworkersCollection
          },
          sort: {
            type: 'SortShape',
            path: 'published',
            order: 'Descending'
          }
        });
      }

      return definitions;
    },

    async materializeCollectionItems(ctx, { collectionUri, webId }) {
      const options = await this.getCollectionMetadata(ctx, collectionUri, webId);
      const itemUris = await this.fetchCollectionItemUris(ctx, collectionUri, options);

      const items = [];
      for (const itemUri of itemUris) {
        const loaded = await this.loadItem(ctx, itemUri, webId);
        if (loaded) items.push(loaded);
      }

      return { options, items };
    },

    async getCollectionMetadata(ctx, collectionUri, webId) {
      const dataset = extractDatasetFromUri(collectionUri);
      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          PREFIX semapps: <http://semapps.org/ns/core#>
          SELECT ?ordered ?itemsPerPage ?sortPredicate ?sortOrder
          WHERE {
            <${collectionUri}> a as:Collection .
            BIND (EXISTS{<${collectionUri}> a as:OrderedCollection} AS ?ordered)
            OPTIONAL { <${collectionUri}> semapps:itemsPerPage ?itemsPerPage . }
            OPTIONAL { <${collectionUri}> semapps:sortPredicate ?sortPredicate . }
            OPTIONAL { <${collectionUri}> semapps:sortOrder ?sortOrder . }
          }
        `,
        accept: MIME_TYPES.JSON,
        webId,
        dataset
      });

      if (!Array.isArray(results) || results.length === 0) {
        throw new MoleculerError('Not found', 404, 'NOT_FOUND');
      }

      const row = results[0];
      return {
        ordered: row.ordered?.value === 'true',
        itemsPerPage: row.itemsPerPage ? Number.parseInt(row.itemsPerPage.value, 10) : undefined,
        sortPredicate: row.sortPredicate?.value,
        sortOrder: row.sortOrder?.value || ASC_ORDER
      };
    },

    async fetchCollectionItemUris(ctx, collectionUri, options) {
      const dataset = extractDatasetFromUri(collectionUri);
      const orderBy = options.ordered && options.sortPredicate
        ? `ORDER BY ${options.sortOrder === DESC_ORDER ? 'DESC' : 'ASC'}(?order)`
        : '';

      const result = await ctx.call('triplestore.query', {
        query: `
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          SELECT DISTINCT ?itemUri
          WHERE {
            <${collectionUri}> a as:Collection .
            OPTIONAL {
              <${collectionUri}> as:items ?itemUri .
              ${options.ordered && options.sortPredicate ? `OPTIONAL { ?itemUri <${options.sortPredicate}> ?order . }` : ''}
            }
          }
          ${orderBy}
        `,
        accept: MIME_TYPES.JSON,
        webId: 'system',
        dataset
      });

      return result.filter(node => node.itemUri).map(node => node.itemUri.value);
    },

    async loadItem(ctx, itemUri, webId) {
      const dataset = extractDatasetFromUri(itemUri);

      try {
        const item = await ctx.call('ldp.resource.get', {
          resourceUri: itemUri,
          accept: MIME_TYPES.JSON,
          webId,
          dataset
        });

        if (!isObject(item)) return null;
        const normalized = { ...item, __itemUri: itemUri };
        delete normalized['@context'];
        return normalized;
      } catch (e) {
        if (e.code === 403 || e.code === 404) return null;
        throw e;
      }
    },

    async applyViewDefinition(ctx, { definition, sourceItems, webId }) {
      const filters = toArray(definition.filter);
      let filtered = sourceItems;

      for (const filterShape of filters) {
        if (!isObject(filterShape)) continue;

        if (filterShape.type === 'InCollectionShape') {
          const targetCollection = normalizeString(filterShape.inCollection);
          if (!targetCollection) {
            filtered = [];
            break;
          }

          let targetUris = [];
          try {
            targetUris = await this.fetchCollectionItemUris(ctx, targetCollection, {
              ordered: true,
              sortPredicate: 'https://www.w3.org/ns/activitystreams#published',
              sortOrder: DESC_ORDER
            });
          } catch {
            targetUris = [];
          }
          const targetSet = new Set(targetUris);

          filtered = filtered.filter(item => {
            const values = this.getPathValues(item, filterShape.path);
            return values.some(value => targetSet.has(value));
          });

          continue;
        }

        filtered = filtered.filter(item => this.matchesPropertyShape(item, filterShape));
      }

      return filtered;
    },

    matchesPropertyShape(item, shape) {
      const values = this.getPathValues(item, shape.path);

      if (Object.prototype.hasOwnProperty.call(shape, 'hasValue')) {
        if (!values.some(value => sameValue(value, shape.hasValue))) return false;
      }

      if (Object.prototype.hasOwnProperty.call(shape, 'minCount')) {
        const minCount = Number.parseInt(shape.minCount, 10);
        if (Number.isFinite(minCount) && values.length < minCount) return false;
      }

      return true;
    },

    getPathValues(item, pathSpec) {
      const path = Array.isArray(pathSpec) ? pathSpec : [pathSpec];
      if (!path.every(segment => typeof segment === 'string' && segment.length > 0)) return [];

      let values = [item];
      for (const segment of path) {
        const next = [];
        for (const value of values) {
          if (!isObject(value)) continue;
          const branch = value[segment];
          for (const expanded of toArray(branch)) {
            if (isObject(expanded)) {
              next.push(expanded.id || expanded['@id'] || expanded.href || expanded.url || expanded);
            } else {
              next.push(expanded);
            }
          }
        }
        values = next;
      }

      return values
        .map(v => (typeof v === 'string' ? v.trim() : v))
        .filter(v => v !== null && v !== undefined && v !== '');
    },

    sortItems(items, sortShape) {
      if (!isObject(sortShape) || !sortShape.path) return [...items];

      const direction = sortShape.order === 'Ascending' ? 1 : -1;
      const path = sortShape.path;

      return [...items].sort((a, b) => {
        const left = this.getPathValues(a, path)[0];
        const right = this.getPathValues(b, path)[0];

        if (left == null && right == null) return 0;
        if (left == null) return 1;
        if (right == null) return -1;

        const leftDate = parseDateValue(left);
        const rightDate = parseDateValue(right);

        if (leftDate !== null && rightDate !== null) {
          return direction * (leftDate - rightDate);
        }

        return direction * String(left).localeCompare(String(right));
      });
    },

    buildCollectionViewPage({ view, beforeEq, afterEq }) {
      const orderedItems = view.orderedItems;
      const cursors = view.orderedItemUris;

      if (beforeEq && !cursors.includes(beforeEq)) {
        throw new MoleculerError(`Cursor not found: ${beforeEq}`, 404, 'NOT_FOUND');
      }
      if (afterEq && !cursors.includes(afterEq)) {
        throw new MoleculerError(`Cursor not found: ${afterEq}`, 404, 'NOT_FOUND');
      }

      if (!beforeEq && !afterEq) {
        return {
          '@context': this.ensureFepContext('https://www.w3.org/ns/activitystreams'),
          id: view.id,
          type: 'CollectionView',
          name: view.name,
          viewOf: view.viewOf,
          filter: view.filter,
          sort: view.sort,
          totalItems: view.totalItems,
          first: view.first,
          last: view.last
        };
      }

      const pageWindow = this.selectPageWindow({
        orderedItems,
        itemUris: cursors,
        itemsPerPage: view.itemsPerPage,
        beforeEq,
        afterEq
      });

      return {
        '@context': this.ensureFepContext('https://www.w3.org/ns/activitystreams'),
        id: `${view.id}?${beforeEq ? 'beforeEq' : 'afterEq'}=${encodeURIComponent(beforeEq || afterEq)}`,
        type: 'CollectionViewPage',
        partOf: view.id,
        orderedItems: this.sanitizeViewItems(pageWindow.items),
        prev: pageWindow.prev,
        next: pageWindow.next
      };
    },

    selectPageWindow({ orderedItems, itemUris, itemsPerPage, beforeEq, afterEq }) {
      const viewId = this.parseViewIdFromItems(orderedItems);
      const pageSize = Number.isFinite(itemsPerPage) && itemsPerPage > 0 ? itemsPerPage : FALLBACK_ITEMS_PER_PAGE;
      if (!orderedItems.length) {
        return {
          items: [],
          prev: undefined,
          next: undefined
        };
      }

      if (beforeEq) {
        const endIndex = itemUris.findIndex(uri => uri === beforeEq);
        const startIndex = Math.max(0, endIndex - pageSize + 1);
        const items = orderedItems.slice(startIndex, endIndex + 1);
        const prevCursor = startIndex > 0 ? itemUris[startIndex - 1] : undefined;
        const nextCursor = endIndex < itemUris.length - 1 ? itemUris[endIndex + 1] : undefined;

        return {
          items,
          prev: prevCursor && viewId ? `${viewId}?beforeEq=${encodeURIComponent(prevCursor)}` : undefined,
          next: nextCursor && viewId ? `${viewId}?afterEq=${encodeURIComponent(nextCursor)}` : undefined
        };
      }

      const startIndex = itemUris.findIndex(uri => uri === afterEq);
      const endIndex = Math.min(itemUris.length, startIndex + pageSize);
      const items = orderedItems.slice(startIndex, endIndex);
      const prevCursor = startIndex > 0 ? itemUris[startIndex - 1] : undefined;
      const nextCursor = endIndex < itemUris.length ? itemUris[endIndex] : undefined;

      return {
        items,
        prev: prevCursor && viewId ? `${viewId}?beforeEq=${encodeURIComponent(prevCursor)}` : undefined,
        next: nextCursor && viewId ? `${viewId}?afterEq=${encodeURIComponent(nextCursor)}` : undefined
      };
    },

    parseViewIdFromItems(orderedItems) {
      return orderedItems[0]?.__viewId || null;
    },

    sanitizeViewItems(items) {
      return items.map(item => {
        if (!isObject(item)) return item;
        const sanitized = { ...item };
        delete sanitized.__itemUri;
        delete sanitized.__viewId;
        return sanitized;
      });
    }
  }
};