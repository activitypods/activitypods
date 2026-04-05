'use strict';

/**
 * TrustEvaluatorMiddleware — log-only trust evaluation hook
 *
 * Runs after every `activitypub.inbox.post` action. Loads the recipient's
 * enabled trust-source records, determines which scopes overlap with the
 * incoming activity type, and emits structured log traces.
 *
 * No enforcement is applied. This is an observation-only pass designed to
 * validate that trust-source evaluation logic is correct before enforcement
 * is turned on.
 */

const { getDatasetFromUri } = require('@semapps/ldp');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

const TRUST_SOURCE_CLASS = 'https://activitypods.org/ns/core#TrustSource';

const CONTEXT = {
  apods: 'https://activitypods.org/ns/core#',
  dc: 'http://purl.org/dc/terms/',
  type: '@type',
  id: '@id',
  source: 'apods:source',
  sourceType: 'apods:sourceType',
  enabled: 'apods:enabled',
  weight: 'apods:weight',
  scopes: 'apods:scopes',
  name: 'apods:name',
  description: 'apods:description'
};

// --- JSON-LD normalization helpers ------------------------------------

const scalarValue = val => (val && typeof val === 'object' && '@value' in val ? val['@value'] : val);

const normalizeBoolean = val => {
  const s = scalarValue(val);
  return s === true || s === 'true';
};

const normalizeNumber = (val, fallback = 1) => {
  const s = scalarValue(val);
  const n = typeof s === 'number' ? s : Number(s);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeScopes = val => {
  if (!val) return [];
  const s = scalarValue(val);
  if (Array.isArray(s)) return s.map(v => String(scalarValue(v)));
  if (typeof s === 'string') return [s];
  return [];
};

const normalizeType = val => {
  if (!val) return null;
  if (Array.isArray(val)) return normalizeType(val[0]);
  return String(val);
};

// --- Activity-to-scope mapping ----------------------------------------

const CONTENT_OBJECT_TYPES = new Set([
  'Note',
  'Article',
  'Video',
  'Image',
  'Audio',
  'Page',
  'Event',
  'Question',
  'as:Note',
  'as:Article',
  'as:Video',
  'as:Image',
  'as:Audio',
  'as:Page',
  'as:Event',
  'as:Question'
]);

/**
 * Returns the set of trust-source scopes that are potentially relevant
 * to an activity. This is a heuristic mapping used for log-only tracing.
 */
const activityRelevantScopes = activity => {
  const type = normalizeType(activity.type || activity['@type']);
  const objectType = normalizeType(
    activity.object && typeof activity.object === 'object'
      ? activity.object.type || activity.object['@type']
      : null
  );

  const scopes = new Set();

  if (type === 'Create' || type === 'Update') {
    if (CONTENT_OBJECT_TYPES.has(objectType)) {
      scopes.add('filter:content');
      scopes.add('label:content');
      scopes.add('rank:down');
      scopes.add('rank:up');
    }
  }

  if (type === 'Announce') {
    scopes.add('filter:content');
    scopes.add('label:content');
    scopes.add('rank:down');
    scopes.add('rank:up');
  }

  // Every actor-bearing activity is relevant to actor-scoped trust rules
  if (activity.actor) {
    scopes.add('filter:actor');
    scopes.add('label:actor');
  }

  return scopes;
};

// --- Middleware --------------------------------------------------------

const TrustEvaluatorMiddleware = () => ({
  name: 'TrustEvaluatorMiddleware',

  localAction: (next, action) => {
    if (action.name !== 'activitypub.inbox.post') return next;

    return async ctx => {
      // Run the inbox action first — evaluation is a non-blocking post-hook
      const result = await next(ctx);

      try {
        const webId = ctx.meta.webId;
        if (!webId || webId === 'anon') return result;

        const { collectionUri, ...activity } = ctx.params;
        const activityId = activity.id || activity['@id'];
        const actorUri =
          typeof activity.actor === 'string' ? activity.actor : activity.actor?.id || activity.actor?.['@id'];
        const activityType = normalizeType(activity.type || activity['@type']);

        // Derive the data container root from the webId
        const u = new URL(webId);
        u.hash = '';
        const base = u.toString().replace(/\/?$/, '/');
        const dataBase = `${base}data/`;
        const dataset = getDatasetFromUri(webId);

        const rows = await ctx.broker.call('triplestore.query', {
          query: sanitizeSparqlQuery`
            SELECT DISTINCT ?resource
            WHERE {
              ?resource a <${TRUST_SOURCE_CLASS}> .
              FILTER(STRSTARTS(STR(?resource), "${dataBase}"))
            }
          `,
          dataset,
          webId: 'system'
        });

        if (!rows || rows.length === 0) return result;

        const uris = rows.map(row => row?.resource?.value).filter(Boolean);

        const trustSources = (
          await Promise.all(
            uris.map(async resourceUri => {
              try {
                return await ctx.broker.call('ldp.resource.get', {
                  resourceUri,
                  webId: 'system',
                  accept: 'application/ld+json',
                  jsonContext: CONTEXT
                });
              } catch {
                return null;
              }
            })
          )
        ).filter(Boolean);

        const enabledSources = trustSources.filter(ts => normalizeBoolean(ts.enabled));
        if (enabledSources.length === 0) return result;

        const relevantScopes = activityRelevantScopes(activity);

        const matches = enabledSources.flatMap(ts => {
          const tsScopes = normalizeScopes(ts.scopes);
          const hit = tsScopes.filter(s => relevantScopes.has(s));
          if (hit.length === 0) return [];
          return [
            {
              trustSourceUri: ts['@id'] || ts.id,
              source: scalarValue(ts.source),
              sourceType: scalarValue(ts.sourceType),
              weight: normalizeNumber(ts.weight),
              matchedScopes: hit
            }
          ];
        });

        if (matches.length > 0) {
          ctx.broker.logger.info('[TrustEval] LOG-ONLY — trust source match (no enforcement applied)', {
            activityId,
            actorUri,
            activityType,
            recipientWebId: webId,
            matches
          });
        } else {
          ctx.broker.logger.debug('[TrustEval] no scope overlap for activity', {
            activityId,
            actorUri,
            activityType,
            recipientWebId: webId,
            enabledCount: enabledSources.length
          });
        }
      } catch (err) {
        ctx.broker.logger.warn('[TrustEval] evaluation error (non-fatal)', { error: err.message });
      }

      return result;
    };
  }
});

module.exports = TrustEvaluatorMiddleware;
