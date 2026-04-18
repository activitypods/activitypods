'use strict';

/**
 * FEP-8fcf: Followers Collection Synchronization — ActivityPods Backend Endpoints
 *
 * Provides three internal API endpoints that the Fedify sidecar calls during
 * followers-collection synchronization.  All three require a bearer token
 * matching ACTIVITYPODS_TOKEN (same secret used by the other internal APIs).
 *
 * Routes registered under /api/internal/followers-sync:
 *
 *   GET  /partial-collection
 *          ?actorIdentifier={id}&domain={domain}
 *        → { followers: string[] }
 *        Returns URIs of followers of the local actor whose id hostname matches
 *        the requested domain.  Used by the sidecar to compute/serve the
 *        Collection-Synchronization header and the /followers_synchronization
 *        endpoint.
 *
 *   GET  /local-followers-of-remote
 *          ?remoteActorUri={encoded}
 *        → { localActors: Array<{ actorUri: string; identifier: string }> }
 *        Returns local actors that currently follow the given remote actor.
 *        Used by the receiver side to compute its local partial digest.
 *
 *   POST /unfollow
 *        Body: { localActorIdentifier: string; remoteActorUri: string }
 *        → 200 OK  { success: true }
 *        Removes a local actor's follow of a remote actor without sending an
 *        Undo Follow activity (the sidecar sends that separately).
 *
 * Spec: https://codeberg.org/fediverse/fep/src/branch/main/fep/8fcf/fep-8fcf.md
 */

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');
const { MIME_TYPES } = require('@semapps/mime-types');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

// Maximum concurrent actor lookups for getLocalFollowersOfRemote
const MAX_CONCURRENT_LOOKUPS = 10;

module.exports = {
  name: 'internal-followers-sync-api',

  dependencies: ['api', 'activitypub.actor', 'activitypub.collection', 'auth.account', 'triplestore'],

  settings: {
    auth: {
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.INTERNAL_API_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        ''
    },
    routePath: '/api/internal/followers-sync'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[FollowersSyncApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'followers-sync-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '64kb' } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff'
          };
        },
        aliases: {
          'GET /partial-collection': 'internal-followers-sync-api.getPartialCollection',
          'GET /local-followers-of-remote': 'internal-followers-sync-api.getLocalFollowersOfRemote',
          'POST /unfollow': 'internal-followers-sync-api.unfollow',
          'GET /blocked-collection': 'internal-followers-sync-api.getBlockedCollection'
        }
      },
      toBottom: false
    });

    this.logger.info(
      '[FollowersSyncApi] Internal routes registered under /api/internal/followers-sync: ' +
        'partial-collection, local-followers-of-remote, unfollow'
    );
  },

  actions: {
    // =========================================================================
    // GET /partial-collection?actorIdentifier={id}&domain={domain}
    // =========================================================================

    getPartialCollection: {
      async handler(ctx) {
        // In moleculer-web, GET query string params arrive in ctx.params.
        // Fall back to ctx.meta.queryString for older moleculer-web versions.
        const actorIdentifier = String(
          ctx.params?.actorIdentifier ?? ctx.meta.queryString?.actorIdentifier ?? ''
        ).trim();
        const domain = String(
          ctx.params?.domain ?? ctx.meta.queryString?.domain ?? ''
        ).trim();

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }
        if (!domain) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'domain is required' };
        }

        // Validate domain is a plausible hostname (no slashes, not a URL)
        if (domain.includes('/') || domain.includes(':')) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'domain must be a bare hostname (e.g. "remote.example.com")' };
        }

        const actor = await this.findActorByIdentifier(ctx, actorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${actorIdentifier}` };
        }

        if (!actor.followers) {
          ctx.meta.$statusCode = 200;
          return { followers: [] };
        }

        const allFollowers = await this.queryCollectionItems(ctx, actor.followers);

        // Partial followers = those whose URI hostname matches the requested domain
        const partialFollowers = allFollowers.filter(uri => {
          try {
            return new URL(uri).hostname === domain;
          } catch {
            return false;
          }
        });

        this.logger.debug('[FollowersSyncApi] getPartialCollection', {
          actorIdentifier,
          domain,
          totalFollowers: allFollowers.length,
          partialCount: partialFollowers.length
        });

        ctx.meta.$statusCode = 200;
        return { followers: partialFollowers };
      }
    },

    // =========================================================================
    // GET /local-followers-of-remote?remoteActorUri={encoded}
    // =========================================================================

    getLocalFollowersOfRemote: {
      async handler(ctx) {
        const remoteActorUri = String(
          ctx.params?.remoteActorUri ?? ctx.meta.queryString?.remoteActorUri ?? ''
        ).trim();

        if (!remoteActorUri) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'remoteActorUri is required' };
        }

        // Validate the URI before interpolating it into SPARQL
        try {
          const parsed = new URL(remoteActorUri);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('invalid protocol');
          }
        } catch {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'remoteActorUri must be a valid http(s) URL' };
        }

        // Query across all datasets (webId: 'system') to find every local actor
        // whose `following` collection contains the remote actor URI.
        //
        // SPARQL pattern:  ?actorUri as:following ?col .  ?col as:items <remoteActorUri>
        //
        // This works in pod-provider mode because triplestore queries with
        // webId: 'system' have cross-dataset read access (same as collection.getOwner).
        let actorUris = [];
        try {
          const rows = await ctx.call('triplestore.query', {
            query: sanitizeSparqlQuery`
              PREFIX as: <https://www.w3.org/ns/activitystreams#>
              SELECT DISTINCT ?actorUri
              WHERE {
                ?actorUri as:following ?followingUri .
                ?followingUri as:items <${remoteActorUri}> .
              }
            `,
            accept: MIME_TYPES.JSON,
            webId: 'system'
          });
          actorUris = rows
            .filter(row => row.actorUri?.value)
            .map(row => row.actorUri.value);
        } catch (err) {
          this.logger.error('[FollowersSyncApi] getLocalFollowersOfRemote: SPARQL query failed', {
            remoteActorUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to query following collections' };
        }

        // Resolve each candidate actor URI to a local actor + identifier.
        // Process in bounded concurrent batches to avoid overwhelming the actor pool.
        const localActors = [];

        for (let i = 0; i < actorUris.length; i += MAX_CONCURRENT_LOOKUPS) {
          const batch = actorUris.slice(i, i + MAX_CONCURRENT_LOOKUPS);
          const results = await Promise.all(
            batch.map(async actorUri => {
              try {
                // Skip non-local actors (the SPARQL result may include remote ones
                // if their data is cached in the triplestore)
                const isLocal = await ctx.call('activitypub.actor.isLocal', { actorUri });
                if (!isLocal) return null;

                const account = await ctx.call('auth.account.findByWebId', { webId: actorUri });
                if (!account?.username) return null;

                return { actorUri, identifier: account.username };
              } catch {
                return null;
              }
            })
          );

          for (const entry of results) {
            if (entry !== null) localActors.push(entry);
          }
        }

        this.logger.debug('[FollowersSyncApi] getLocalFollowersOfRemote', {
          remoteActorUri,
          localActorCount: localActors.length
        });

        ctx.meta.$statusCode = 200;
        return { localActors };
      }
    },

    // =========================================================================
    // POST /unfollow
    // Body: { localActorIdentifier: string; remoteActorUri: string }
    // =========================================================================

    unfollow: {
      async handler(ctx) {
        const localActorIdentifier = String(ctx.params?.localActorIdentifier ?? '').trim();
        const remoteActorUri = String(ctx.params?.remoteActorUri ?? '').trim();

        if (!localActorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'localActorIdentifier is required' };
        }
        if (!remoteActorUri) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'remoteActorUri is required' };
        }

        // Validate remoteActorUri before using it
        try {
          const parsed = new URL(remoteActorUri);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('invalid protocol');
          }
        } catch {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'remoteActorUri must be a valid http(s) URL' };
        }

        const actor = await this.findActorByIdentifier(ctx, localActorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${localActorIdentifier}` };
        }

        if (!actor.following) {
          // Actor has no following collection — nothing to remove
          ctx.meta.$statusCode = 200;
          return { success: true };
        }

        // Check whether the local actor is actually following the remote actor
        // before attempting removal (avoids spurious collection.remove errors).
        let isFollowing;
        try {
          isFollowing = await ctx.call('activitypub.collection.includes', {
            collectionUri: actor.following,
            itemUri: remoteActorUri
          });
        } catch (err) {
          this.logger.warn('[FollowersSyncApi] unfollow: could not check collection membership', {
            localActorIdentifier,
            remoteActorUri,
            error: err.message
          });
          isFollowing = false;
        }

        if (!isFollowing) {
          // Already not following — treat as success (idempotent)
          ctx.meta.$statusCode = 200;
          return { success: true };
        }

        try {
          await ctx.call('activitypub.collection.remove', {
            collectionUri: actor.following,
            itemUri: remoteActorUri
          });
        } catch (err) {
          this.logger.error('[FollowersSyncApi] unfollow: failed to remove from following collection', {
            localActorIdentifier,
            remoteActorUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to remove follow' };
        }

        this.logger.info('[FollowersSyncApi] Removed stale local follow (FEP-8fcf reconciliation)', {
          localActorIdentifier,
          remoteActorUri
        });

        ctx.meta.$statusCode = 200;
        return { success: true };
      }
    },

    // =========================================================================
    // GET /blocked-collection?actorIdentifier={id}
    // =========================================================================

    /**
     * FEP-c648: Return the blocked actor URIs for a local actor.
     *
     * ActivityPods stores Block activity IDs in the `blocked` collection (with
     * dereferenceItems: true).  We resolve each Block activity and extract its
     * `object` field, which is the blocked actor URI per FEP-c648.
     *
     * Returns: { items: string[] }   — ordered array of blocked actor URIs.
     */
    getBlockedCollection: {
      async handler(ctx) {
        const actorIdentifier = String(
          ctx.params?.actorIdentifier ?? ctx.meta.queryString?.actorIdentifier ?? ''
        ).trim();

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }

        const actor = await this.findActorByIdentifier(ctx, actorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${actorIdentifier}` };
        }

        // Resolve the blocked collection URI from the actor document.
        // ActivityPods uses the predicate https://purl.archive.org/socialweb/blocked#blocked
        // which may appear as `actor.blocked`, `actor['bl:blocked']`, or via the full URI key.
        const BLOCKED_PREDICATE = 'https://purl.archive.org/socialweb/blocked#blocked';
        const blockedCollectionUri =
          actor.blocked ||
          actor['bl:blocked'] ||
          actor[BLOCKED_PREDICATE];

        if (!blockedCollectionUri) {
          ctx.meta.$statusCode = 200;
          return { items: [] };
        }

        // Retrieve the collection.  ActivityPods stores Block activity IDs with
        // dereferenceItems: true, so orderedItems contains full Block activity objects.
        let collection;
        try {
          collection = await ctx.call('activitypub.collection.get', {
            resourceUri: blockedCollectionUri,
            webId: 'system'
          });
        } catch (err) {
          this.logger.error('[FollowersSyncApi] getBlockedCollection: failed to fetch collection', {
            actorIdentifier,
            blockedCollectionUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to fetch blocked collection' };
        }

        // Extract blocked actor URIs from Block activity `object` fields.
        const rawItems = collection?.orderedItems || collection?.items || [];
        const items = [];
        for (const item of rawItems) {
          if (typeof item === 'string') {
            // Plain URI stored directly — treat as actor URI.
            items.push(item);
          } else if (item && typeof item === 'object') {
            // Dereferenced Block activity object: extract `object` field.
            const obj = item.object;
            if (typeof obj === 'string') {
              items.push(obj);
            } else if (obj && typeof obj === 'object' && typeof obj.id === 'string') {
              items.push(obj.id);
            }
          }
        }

        this.logger.debug('[FollowersSyncApi] getBlockedCollection', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return { items };
      }
    }
  },

  methods: {
    // -------------------------------------------------------------------------
    // findActorByIdentifier
    // -------------------------------------------------------------------------

    /**
     * Look up a local actor by their sidecar identifier (= AP preferredUsername =
     * account username).  Returns the AP actor object (with `followers`,
     * `following`, etc.) or null if not found.
     *
     * Flow: auth.account.findByUsername → webId → activitypub.actor.get
     */
    async findActorByIdentifier(ctx, identifier) {
      try {
        const account = await ctx.call('auth.account.findByUsername', { username: identifier });
        if (!account?.webId) return null;

        const actor = await ctx.call('activitypub.actor.get', { actorUri: account.webId });
        return actor || null;
      } catch {
        return null;
      }
    },

    // -------------------------------------------------------------------------
    // queryCollectionItems
    // -------------------------------------------------------------------------

    /**
     * Return all item URIs stored in an ActivityStreams collection.
     * Uses a raw triplestore query so it works regardless of WAC permissions
     * (system-level read).  Returns [] on any error.
     */
    async queryCollectionItems(ctx, collectionUri) {
      try {
        const rows = await ctx.call('triplestore.query', {
          query: sanitizeSparqlQuery`
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            SELECT DISTINCT ?itemUri
            WHERE {
              <${collectionUri}> a as:Collection .
              <${collectionUri}> as:items ?itemUri .
            }
          `,
          accept: MIME_TYPES.JSON,
          webId: 'system'
        });
        return rows.filter(row => row.itemUri?.value).map(row => row.itemUri.value);
      } catch {
        return [];
      }
    },

    // -------------------------------------------------------------------------
    // Auth helpers (same pattern as other internal API services)
    // -------------------------------------------------------------------------

    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) return null;
      return match[1];
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), 'utf8');
      const got = Buffer.from(String(provided), 'utf8');
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      const lengthMatch = exp.length === got.length;
      const contentMatch = crypto.timingSafeEqual(expPadded, gotPadded);
      return lengthMatch && contentMatch;
    }
  }
};
