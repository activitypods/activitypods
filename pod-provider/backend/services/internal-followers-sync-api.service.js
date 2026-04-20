'use strict';

/**
 * FEP-8fcf: Followers Collection Synchronization — ActivityPods Backend Endpoints
 *
 * Provides internal API endpoints that the Fedify sidecar calls during
 * followers-collection synchronization plus block/mute collection
 * projection. All routes require a bearer token
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
 *   GET  /blocked-collection
 *          ?actorIdentifier={id}
 *        → { items: string[], public: boolean, followersCollection?: string|null }
 *        Returns blocked actor URIs in reverse-chronological order plus the
 *        current public/followable state of the blocked collection.
 *
 *   GET  /blocked-followers-collection
 *          ?actorIdentifier={id}
 *        → { items: string[], public: boolean, followersCollection?: string|null }
 *        Returns follower actor URIs for a public blocked collection.
 *
 *   GET  /blocks-collection
 *          ?actorIdentifier={id}
 *        → { items: Array<{ id, type, object, published? }> }
 *        Returns active Block activities in reverse-chronological order.
 *
 *   GET  /muted-collection
 *          ?actorIdentifier={id}
 *        → { items: Array<{ type, subjectCanonicalId, subjectProtocol, id?, published? }>,
 *            public: boolean,
 *            followersCollection?: string|null }
 *        Returns muted subject projections in reverse-chronological order plus
 *        the current public/followable state of the muted collection.
 *
 *   GET  /muted-followers-collection
 *          ?actorIdentifier={id}
 *        → { items: string[], public: boolean, followersCollection?: string|null }
 *        Returns follower actor URIs for a public muted collection.
 *
 * Spec: https://codeberg.org/fediverse/fep/src/branch/main/fep/8fcf/fep-8fcf.md
 */

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');
const { getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

const BLOCKED_PREDICATE = 'https://purl.archive.org/socialweb/blocked#blocked';
const BLOCKS_PREDICATE = 'https://purl.archive.org/socialweb/blocked#blocks';
const MUTED_PREDICATE = 'http://activitypods.org/ns/core#muted';
const MUTE_RESOURCE_CLASS_URI = 'https://activitypods.org/ns/core#Mute';
const APODS_SUBJECT_CANONICAL_ID = 'https://activitypods.org/ns/core#subjectCanonicalId';
const APODS_SUBJECT_PROTOCOL = 'https://activitypods.org/ns/core#subjectProtocol';
const DCTERMS_CREATED = 'http://purl.org/dc/terms/created';
const DCTERMS_MODIFIED = 'http://purl.org/dc/terms/modified';

// Maximum concurrent actor lookups for getLocalFollowersOfRemote
const MAX_CONCURRENT_LOOKUPS = 10;

module.exports = {
  name: 'internal-followers-sync-api',

  dependencies: [
    'api',
    'activitypub.actor',
    'activitypub.blocked',
    'activitypub.muted',
    'activitypub.collection',
    'auth.account',
    'triplestore'
  ],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
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
          'GET /blocked-collection': 'internal-followers-sync-api.getBlockedCollection',
          'GET /blocked-followers-collection': 'internal-followers-sync-api.getBlockedFollowersCollection',
          'GET /blocks-collection': 'internal-followers-sync-api.getBlocksCollection',
          'GET /muted-collection': 'internal-followers-sync-api.getMutedCollection',
          'GET /muted-followers-collection': 'internal-followers-sync-api.getMutedFollowersCollection'
        }
      },
      toBottom: false
    });

    this.logger.info(
      '[FollowersSyncApi] Internal routes registered under /api/internal/followers-sync: ' +
        'partial-collection, local-followers-of-remote, unfollow, blocked-collection, blocked-followers-collection, blocks-collection, muted-collection, muted-followers-collection'
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
        const domain = String(ctx.params?.domain ?? ctx.meta.queryString?.domain ?? '').trim();

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
        const remoteActorUri = String(ctx.params?.remoteActorUri ?? ctx.meta.queryString?.remoteActorUri ?? '').trim();

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
          actorUris = rows.filter(row => row.actorUri?.value).map(row => row.actorUri.value);
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

        const blockedCollectionUri =
          this.resolveBlockedCollectionUriFromActor(actor) || this.resolveBlocksCollectionUriFromActor(actor);

        if (!blockedCollectionUri) {
          ctx.meta.$statusCode = 200;
          return { items: [], public: false, followersCollection: null };
        }

        const sharingState = await this.getBlockedCollectionSharingState(ctx, actor);

        let collection;
        try {
          collection = await this.getCollectionByUri(ctx, blockedCollectionUri);
        } catch (err) {
          this.logger.error('[FollowersSyncApi] getBlockedCollection: failed to fetch collection', {
            actorIdentifier,
            blockedCollectionUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to fetch blocked collection' };
        }

        const items = this.extractBlockedActorUris(collection);

        this.logger.debug('[FollowersSyncApi] getBlockedCollection', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return {
          items,
          public: sharingState.public,
          followersCollection: sharingState.followersCollectionUri
        };
      }
    },

    getBlockedFollowersCollection: {
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

        const sharingState = await this.getBlockedCollectionSharingState(ctx, actor);
        if (!sharingState.public || !sharingState.followersCollectionUri) {
          ctx.meta.$statusCode = 200;
          return { items: [], public: false, followersCollection: null };
        }

        let collection;
        try {
          collection = await this.getCollectionByUri(ctx, sharingState.followersCollectionUri);
        } catch (err) {
          this.logger.error('[FollowersSyncApi] getBlockedFollowersCollection: failed to fetch collection', {
            actorIdentifier,
            followersCollectionUri: sharingState.followersCollectionUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to fetch blocked followers collection' };
        }

        const items = this.extractCollectionActorUris(collection);

        this.logger.debug('[FollowersSyncApi] getBlockedFollowersCollection', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return {
          items,
          public: true,
          followersCollection: sharingState.followersCollectionUri
        };
      }
    },

    // =========================================================================
    // GET /blocks-collection?actorIdentifier={id}
    // =========================================================================

    /**
     * FEP-c648: Return the active Block activities for a local actor.
     *
     * The preferred source is the actor's `blocks` collection. For older data,
     * fall back to the existing `blocked` collection, which also stores Block
     * activities and preserves reverse-chronological order.
     *
     * Returns: { items: Array<{ id, type, object, published? }> }
     */
    getBlocksCollection: {
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

        const blocksCollectionUri =
          this.resolveBlocksCollectionUriFromActor(actor) || this.resolveBlockedCollectionUriFromActor(actor);

        if (!blocksCollectionUri) {
          ctx.meta.$statusCode = 200;
          return { items: [] };
        }

        let collection;
        try {
          collection = await this.getCollectionByUri(ctx, blocksCollectionUri);
        } catch (err) {
          this.logger.error('[FollowersSyncApi] getBlocksCollection: failed to fetch collection', {
            actorIdentifier,
            blocksCollectionUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to fetch blocks collection' };
        }

        const items = this.extractBlockActivities(collection);

        this.logger.debug('[FollowersSyncApi] getBlocksCollection', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return { items };
      }
    },

    getMutedCollection: {
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

        const mutedCollectionUri =
          this.resolveMutedCollectionUriFromActor(actor) || `${actor.id || actor['@id']}/muted`;

        const sharingState = await this.getMutedCollectionSharingState(ctx, actor);
        const rows = await this.queryMuteSubjectRows(ctx, actor.id || actor['@id']);
        const items = this.normalizeMutedSubjects(rows);

        this.logger.debug('[FollowersSyncApi] getMutedCollection', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return {
          items,
          public: sharingState.public,
          followersCollection: sharingState.followersCollectionUri,
          collectionUri: mutedCollectionUri
        };
      }
    },

    getMutedFollowersCollection: {
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

        const sharingState = await this.getMutedCollectionSharingState(ctx, actor);
        if (!sharingState.public || !sharingState.followersCollectionUri) {
          ctx.meta.$statusCode = 200;
          return { items: [], public: false, followersCollection: null };
        }

        let collection;
        try {
          collection = await this.getCollectionByUri(ctx, sharingState.followersCollectionUri);
        } catch (err) {
          this.logger.error('[FollowersSyncApi] getMutedFollowersCollection: failed to fetch collection', {
            actorIdentifier,
            followersCollectionUri: sharingState.followersCollectionUri,
            error: err.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to fetch muted followers collection' };
        }

        const items = this.extractCollectionActorUris(collection);

        this.logger.debug('[FollowersSyncApi] getMutedFollowersCollection', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return {
          items,
          public: true,
          followersCollection: sharingState.followersCollectionUri
        };
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

    resolveBlockedCollectionUriFromActor(actor) {
      if (!actor || typeof actor !== 'object') return null;
      return actor.blocked || actor['bl:blocked'] || actor[BLOCKED_PREDICATE] || null;
    },

    resolveBlocksCollectionUriFromActor(actor) {
      if (!actor || typeof actor !== 'object') return null;
      return actor.blocks || actor['bl:blocks'] || actor[BLOCKS_PREDICATE] || null;
    },

    resolveMutedCollectionUriFromActor(actor) {
      if (!actor || typeof actor !== 'object') return null;
      return actor.muted || actor['apods:muted'] || actor[MUTED_PREDICATE] || null;
    },

    async getCollectionByUri(ctx, resourceUri) {
      return ctx.call('activitypub.collection.get', {
        resourceUri,
        webId: 'system'
      });
    },
    async getBlockedCollectionSharingState(ctx, actor) {
      const actorUri = actor?.id || actor?.['@id'];
      if (typeof actorUri !== 'string' || actorUri.length === 0) {
        return {
          public: false,
          followersCollectionUri: null
        };
      }

      try {
        const state = await ctx.call('activitypub.blocked.getBlockedCollectionSharingState', {
          actorUri
        });

        return {
          public: state?.public === true,
          followersCollectionUri: state?.followersCollectionUri || null
        };
      } catch (err) {
        this.logger.warn('[FollowersSyncApi] failed to resolve blocked collection sharing state', {
          actorUri,
          error: err.message
        });
        return {
          public: false,
          followersCollectionUri: null
        };
      }
    },
    async getMutedCollectionSharingState(ctx, actor) {
      const actorUri = actor?.id || actor?.['@id'];
      if (typeof actorUri !== 'string' || actorUri.length === 0) {
        return {
          public: false,
          followersCollectionUri: null
        };
      }

      try {
        const state = await ctx.call('activitypub.muted.getMutedCollectionSharingState', {
          actorUri
        });

        return {
          public: state?.public === true,
          followersCollectionUri: state?.followersCollectionUri || null
        };
      } catch (err) {
        this.logger.warn('[FollowersSyncApi] failed to resolve muted collection sharing state', {
          actorUri,
          error: err.message
        });
        return {
          public: false,
          followersCollectionUri: null
        };
      }
    },

    getCollectionItems(collection) {
      if (!collection || typeof collection !== 'object') return [];
      const items = collection.orderedItems || collection.items || [];
      return Array.isArray(items) ? items : [];
    },
    extractCollectionActorUris(collection) {
      const rawItems = this.getCollectionItems(collection);
      const items = [];
      const seen = new Set();

      for (const item of rawItems) {
        const actorUri =
          typeof item === 'string'
            ? item
            : item?.id || item?.['@id'] || null;

        if (typeof actorUri !== 'string' || seen.has(actorUri)) continue;

        seen.add(actorUri);
        items.push(actorUri);
      }

      return items;
    },

    extractBlockedActorUris(collection) {
      const rawItems = this.getCollectionItems(collection);
      const items = [];
      const seen = new Set();

      for (const item of rawItems) {
        const actorUri = this.extractBlockObjectUri(item);
        if (!actorUri || seen.has(actorUri)) continue;

        seen.add(actorUri);
        items.push(actorUri);
      }

      return items;
    },

    extractBlockActivities(collection) {
      const rawItems = this.getCollectionItems(collection);
      const items = [];
      const seen = new Set();

      for (const item of rawItems) {
        const normalized = this.normalizeBlockActivity(item);
        if (!normalized || seen.has(normalized.id)) continue;

        seen.add(normalized.id);
        items.push(normalized);
      }

      return items;
    },

    extractBlockObjectUri(item) {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const obj = item.object;
      if (typeof obj === 'string') {
        return obj;
      }

      if (obj && typeof obj === 'object') {
        if (typeof obj.id === 'string') return obj.id;
        if (typeof obj['@id'] === 'string') return obj['@id'];
      }

      return null;
    },

    normalizeBlockObject(value) {
      if (typeof value === 'string') {
        return value;
      }

      if (!value || typeof value !== 'object') {
        return null;
      }

      const id = value.id || value['@id'];
      if (typeof id !== 'string') {
        return null;
      }

      const normalized = { id };
      const type = value.type || value['@type'];
      if (typeof type === 'string' || Array.isArray(type)) {
        normalized.type = type;
      }
      if (typeof value.name === 'string') {
        normalized.name = value.name;
      }

      return normalized;
    },

    normalizeBlockActivity(item) {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const id = item.id || item['@id'];
      if (typeof id !== 'string') {
        return null;
      }

      const type = item.type || item['@type'] || 'Block';
      const includesBlock = Array.isArray(type) ? type.includes('Block') : type === 'Block';
      if (!includesBlock) {
        return null;
      }

      const object = this.normalizeBlockObject(item.object);
      if (!object) {
        return null;
      }

      const normalized = { id, type, object };
      if (typeof item.published === 'string') {
        normalized.published = item.published;
      }

      return normalized;
    },
    base(webId) {
      const url = new URL(webId);
      url.hash = '';
      let baseUri = url.toString();
      if (!baseUri.endsWith('/')) {
        baseUri += '/';
      }
      return baseUri;
    },
    dataContainer(webId) {
      return `${this.base(webId)}data/`;
    },
    async queryMuteSubjectRows(ctx, actorUri) {
      if (typeof actorUri !== 'string' || actorUri.length === 0) {
        return [];
      }

      const dataset = getDatasetFromUri(actorUri);
      const dataBase = this.dataContainer(actorUri);

      try {
        const rows = await ctx.call('triplestore.query', {
          query: sanitizeSparqlQuery`
            SELECT DISTINCT ?resource ?subjectCanonicalId ?subjectProtocol ?createdAt ?updatedAt
            WHERE {
              ?resource a <${MUTE_RESOURCE_CLASS_URI}> .
              FILTER(STRSTARTS(STR(?resource), "${dataBase}"))
              OPTIONAL { ?resource <${APODS_SUBJECT_CANONICAL_ID}> ?subjectCanonicalId . }
              OPTIONAL { ?resource <${APODS_SUBJECT_PROTOCOL}> ?subjectProtocol . }
              OPTIONAL { ?resource <${DCTERMS_CREATED}> ?createdAt . }
              OPTIONAL { ?resource <${DCTERMS_MODIFIED}> ?updatedAt . }
            }
            ORDER BY DESC(?createdAt) DESC(?updatedAt) DESC(?resource)
          `,
          dataset,
          webId: 'system'
        });

        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        this.logger.error('[FollowersSyncApi] failed to query mute subject rows', {
          actorUri,
          error: err.message
        });
        return [];
      }
    },
    isAbsoluteUri(value) {
      return typeof value === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(value.trim());
    },
    normalizeMutedSubjects(rows) {
      const items = [];
      const seen = new Set();

      for (const row of rows) {
        const subjectCanonicalId = String(row?.subjectCanonicalId?.value || '').trim();
        const subjectProtocol = String(row?.subjectProtocol?.value || '').trim().toLowerCase();
        if (!subjectCanonicalId || !subjectProtocol) {
          continue;
        }

        const key = `${subjectProtocol}\u0000${subjectCanonicalId.toLowerCase()}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const normalized = {
          type: 'Object',
          subjectCanonicalId,
          subjectProtocol
        };

        if (this.isAbsoluteUri(subjectCanonicalId)) {
          normalized.id = subjectCanonicalId;
        }

        const published = String(row?.createdAt?.value || row?.updatedAt?.value || '').trim();
        if (published) {
          normalized.published = published;
        }

        items.push(normalized);
      }

      return items;
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
