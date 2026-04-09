'use strict';

/**
 * TrustEvaluatorMiddleware
 *
 * Hooks activitypub.inbox.post. Evaluates incoming activities against the
 * recipient's enabled trust-source records and either logs the verdict
 * (observe mode) or enforces it by blocking the inbox post (enforce mode).
 *
 * Configuration via environment variables:
 *   TRUST_EVAL_MODE            'observe' (default) | 'enforce'
 *   TRUST_EVAL_BLOCK_THRESHOLD  float 0–1 (default 0.9)
 *     In enforce mode, any enabled filter-scoped trust source whose weight
 *     meets or exceeds this threshold will cause the activity to be blocked.
 */

const { Errors } = require('moleculer');
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

const FILTER_SCOPES = new Set(['filter:content', 'filter:actor']);

/**
 * Returns the set of trust-source scopes relevant to an activity.
 */
const activityRelevantScopes = activity => {
  const type = normalizeType(activity.type || activity['@type']);
  const objectType = normalizeType(
    activity.object && typeof activity.object === 'object' ? activity.object.type || activity.object['@type'] : null
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

  if (activity.actor) {
    scopes.add('filter:actor');
    scopes.add('label:actor');
  }

  return scopes;
};

// --- Core evaluation --------------------------------------------------

/**
 * Loads the recipient's enabled trust sources and evaluates the activity.
 * Returns null if the recipient has no enabled trust sources.
 *
 * @returns {Promise<{
 *   activityId: string, actorUri: string, activityType: string,
 *   recipientWebId: string, matches: object[], enabledCount: number,
 *   shouldBlock: boolean
 * }|null>}
 */
async function evaluateActivity(ctx, blockThreshold) {
  const webId = ctx.meta.webId;
  if (!webId || webId === 'anon') return null;

  const { collectionUri, ...activity } = ctx.params;
  const activityId = activity.id || activity['@id'];
  const actorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id || activity.actor?.['@id'];
  const activityType = normalizeType(activity.type || activity['@type']);

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

  if (!rows || rows.length === 0) return null;

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
  if (enabledSources.length === 0) return null;

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

  // shouldBlock: any matched source has a filter scope AND weight >= threshold
  const shouldBlock = matches.some(
    m => normalizeNumber(m.weight) >= blockThreshold && m.matchedScopes.some(s => FILTER_SCOPES.has(s))
  );

  return {
    activityId,
    actorUri,
    activityType,
    recipientWebId: webId,
    matches,
    enabledCount: enabledSources.length,
    shouldBlock
  };
}

// --- Middleware --------------------------------------------------------

const TrustEvaluatorMiddleware = ({
  mode = process.env.TRUST_EVAL_MODE || 'observe',
  blockThreshold = Number(process.env.TRUST_EVAL_BLOCK_THRESHOLD) || 0.9
} = {}) => ({
  name: 'TrustEvaluatorMiddleware',

  localAction: (next, action) => {
    if (action.name !== 'activitypub.inbox.post') return next;

    const isEnforce = mode === 'enforce';

    return async ctx => {
      let evalResult = null;

      try {
        evalResult = await evaluateActivity(ctx, blockThreshold);
      } catch (err) {
        ctx.broker.logger.warn('[TrustEval] evaluation error (non-fatal)', { error: err.message });
      }

      // In enforce mode: block BEFORE storing the activity
      if (isEnforce && evalResult?.shouldBlock) {
        const blockPayload = {
          activityId: evalResult.activityId,
          actorUri: evalResult.actorUri,
          activityType: evalResult.activityType,
          recipientWebId: evalResult.recipientWebId,
          matches: evalResult.matches
        };
        ctx.broker.emit('trust-eval.blocked', blockPayload);
        ctx.broker.logger.info('[TrustEval] ENFORCE — activity blocked by trust evaluation', blockPayload);
        throw new Errors.MoleculerError(
          'Activity blocked by trust source evaluation',
          403,
          'TRUST_EVAL_BLOCK',
          blockPayload
        );
      }

      const result = await next(ctx);

      // Log verdict after successful inbox storage
      if (evalResult && evalResult.matches.length > 0) {
        ctx.broker.logger.info(`[TrustEval] ${isEnforce ? 'ENFORCE' : 'LOG-ONLY'} — trust source match`, {
          activityId: evalResult.activityId,
          actorUri: evalResult.actorUri,
          activityType: evalResult.activityType,
          recipientWebId: evalResult.recipientWebId,
          matches: evalResult.matches,
          mode
        });
      } else if (evalResult) {
        ctx.broker.logger.debug('[TrustEval] no scope overlap for activity', {
          activityId: evalResult.activityId,
          actorUri: evalResult.actorUri,
          activityType: evalResult.activityType,
          recipientWebId: evalResult.recipientWebId,
          enabledCount: evalResult.enabledCount,
          mode
        });
      }

      return result;
    };
  }
});

module.exports = TrustEvaluatorMiddleware;
