const { ActivitiesHandlerMixin, ACTIVITY_TYPES, ACTOR_TYPES } = require('@semapps/activitypub');
const matchActivity = require('@semapps/activitypub/utils/matchActivity');
const { MIME_TYPES } = require('@semapps/mime-types');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

const BLOCKED_PREDICATE = 'https://purl.archive.org/socialweb/blocked#blocked';
const BLOCKS_PREDICATE = 'https://purl.archive.org/socialweb/blocked#blocks';
const BLOCKED_OF_PREDICATE = 'https://www.w3.org/ns/activitystreams#blockedOf';
const BLOCKS_OF_PREDICATE = 'https://www.w3.org/ns/activitystreams#blocksOf';
const AS_ATTRIBUTED_TO_PREDICATE = 'https://www.w3.org/ns/activitystreams#attributedTo';
const AS_FOLLOWERS_PREDICATE = 'https://www.w3.org/ns/activitystreams#followers';
const APODS_PUBLIC_BLOCKED_COLLECTION = 'http://activitypods.org/ns/core#publicBlockedCollection';
const DESC_ORDER = 'http://semapps.org/ns/core#DescOrder';
const PUBLISHED_PREDICATE = 'https://www.w3.org/ns/activitystreams#published';
const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';
const PATCHED_PROCESSOR_FLAG = '__activitypodsBlockedCollectionProcessorPatched';
const BLOCKED_COLLECTION_PATH_RE = /^\/users\/([A-Za-z0-9._-]{1,128})\/blocked$/;
const DEFAULT_GRAPH = {
  termType: 'DefaultGraph',
  value: '',
  equals(other) {
    return Boolean(other) && other.termType === 'DefaultGraph';
  }
};

function namedNode(value) {
  return {
    termType: 'NamedNode',
    value,
    equals(other) {
      return Boolean(other) && other.termType === 'NamedNode' && other.value === value;
    }
  };
}

function literal(value, datatype) {
  return {
    termType: 'Literal',
    value,
    language: '',
    datatype,
    equals(other) {
      return (
        Boolean(other) &&
        other.termType === 'Literal' &&
        other.value === value &&
        other.language === '' &&
        Boolean(other.datatype) &&
        other.datatype.value === datatype.value
      );
    }
  };
}

function quad(subject, predicate, object, graph = DEFAULT_GRAPH) {
  return {
    termType: 'Quad',
    subject,
    predicate,
    object,
    graph,
    equals(other) {
      return (
        Boolean(other) &&
        other.termType === 'Quad' &&
        subject.equals(other.subject) &&
        predicate.equals(other.predicate) &&
        object.equals(other.object) &&
        graph.equals(other.graph)
      );
    }
  };
}

module.exports = {
  name: 'activitypub.blocked',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    blockedCollectionOptions: {
      path: '/blocked',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: BLOCKED_PREDICATE,
      ordered: true,
      dereferenceItems: true,
      sortPredicate: PUBLISHED_PREDICATE,
      sortOrder: DESC_ORDER,
      permissions: {}
    },
    blocksCollectionOptions: {
      path: '/blocks',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: BLOCKS_PREDICATE,
      ordered: true,
      dereferenceItems: true,
      sortPredicate: PUBLISHED_PREDICATE,
      sortOrder: DESC_ORDER,
      permissions: {}
    },
    blockedFollowersCollectionOptions: {
      path: '/followers',
      attachPredicate: AS_FOLLOWERS_PREDICATE,
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    }
  },
  dependencies: [
    'activitypub.actor',
    'activitypub.collection',
    'activitypub.collections-registry',
    'activitypub.follow',
    'activitypub.side-effects',
    'auth.account',
    'triplestore',
    'webacl'
  ],
  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.blockedCollectionOptions);
    await this.broker.call('activitypub.collections-registry.register', this.settings.blocksCollectionOptions);

    const accounts = await this.broker.call('auth.account.find');
    for (const account of accounts) {
      if (!account?.webId) continue;
      try {
        await this.ensureCollectionsForActor(this.broker, account.webId);
      } catch (error) {
        this.logger.warn('[activitypub.blocked] blocked collection bootstrap skipped for actor', {
          actorUri: account.webId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.patchDefaultFollowProcessors();
  },
  actions: {
    async updateCollectionsOptions(ctx) {
      const { dataset } = ctx.params;
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.blockedCollectionOptions,
        dataset
      });
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.blocksCollectionOptions,
        dataset
      });
    },
    async backfillBlockedCollections(ctx) {
      const accounts = await ctx.call('auth.account.find');
      for (const account of accounts) {
        if (!account?.webId) continue;
        await this.ensureCollectionsForActor(ctx, account.webId);
      }
    },
    getBlockedCollectionSharingState: {
      params: {
        actorUri: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        return this.getBlockedCollectionSharingStateForActor(ctx, ctx.params.actorUri);
      }
    },
    setBlockedCollectionPublic: {
      params: {
        actorUri: { type: 'string', min: 1 },
        isPublic: { type: 'boolean', convert: true }
      },
      async handler(ctx) {
        return this.setBlockedCollectionPublicState(ctx, ctx.params.actorUri, ctx.params.isPublic);
      }
    }
  },
  activities: {
    blockActor: {
      async match(activity) {
        if (this.hasType(activity, ACTIVITY_TYPES.BLOCK)) {
          return { match: true, dereferencedActivity: activity };
        }
        return { match: false, dereferencedActivity: activity };
      },
      async onEmit(ctx, activity, emitterUri) {
        const blockActivityId = activity?.id || activity?.['@id'];
        if (!blockActivityId) return;

        await this.mutateBlockCollections(ctx, emitterUri, blockActivityId, 'add');
      }
    },
    undoBlockActor: {
      async match(activity) {
        if (!this.hasType(activity, ACTIVITY_TYPES.UNDO)) {
          return { match: false, dereferencedActivity: activity };
        }

        if (typeof activity.object === 'string') {
          return { match: true, dereferencedActivity: activity };
        }

        if (this.hasType(activity.object, ACTIVITY_TYPES.BLOCK)) {
          return { match: true, dereferencedActivity: activity };
        }

        return { match: false, dereferencedActivity: activity };
      },
      async onEmit(ctx, activity, emitterUri) {
        const blockActivityId = await this.resolveUndoneBlockActivityId(ctx, activity, emitterUri);
        if (!blockActivityId) return;

        await this.mutateBlockCollections(ctx, emitterUri, blockActivityId, 'remove');
      }
    },
    followBlockedCollection: {
      priority: 5,
      async match(activity, fetcher) {
        return this.matchFollowBlockedCollection(activity, fetcher);
      },
      async onReceive(ctx, activity, recipientUri) {
        const targetCollectionUri = this.extractFollowTargetCollectionUri(activity);
        if (!targetCollectionUri) return;

        const ownerActorUri = this.getBlockedCollectionOwnerUri(targetCollectionUri);
        if (!ownerActorUri || (recipientUri && recipientUri !== ownerActorUri)) {
          return;
        }

        const state = await this.getBlockedCollectionSharingStateByCollectionUri(ctx, targetCollectionUri);
        if (!state.public) {
          this.logger.info('[blocked] ignoring Follow for private blocked collection', {
            targetCollectionUri,
            actor: this.extractActorUri(activity.actor)
          });
          return;
        }

        const followerUri = this.extractActorUri(activity.actor);
        if (!followerUri) return;

        const followersCollectionUri = await this.ensureBlockedFollowersCollection(
          ctx,
          targetCollectionUri,
          ownerActorUri
        );
        await ctx.call('activitypub.collection.add', {
          collectionUri: followersCollectionUri,
          item: followerUri
        });

        const ownerActor = await ctx.call('activitypub.actor.get', { actorUri: ownerActorUri });
        if (!ownerActor?.outbox) {
          this.logger.warn('[blocked] unable to accept blocked-collection follow because owner outbox is missing', {
            ownerActorUri,
            targetCollectionUri
          });
          return;
        }

        const { '@context': _context, ...activityObject } = activity;
        await ctx.call('activitypub.outbox.post', {
          collectionUri: ownerActor.outbox,
          '@context': 'https://www.w3.org/ns/activitystreams',
          actor: ownerActorUri,
          type: ACTIVITY_TYPES.ACCEPT,
          object: activityObject,
          to: followerUri
        });
      }
    },
    undoFollowBlockedCollection: {
      priority: 5,
      async match(activity, fetcher) {
        return this.matchUndoFollowBlockedCollection(activity, fetcher);
      },
      async onReceive(ctx, activity, recipientUri) {
        const followActivity = await this.resolveUndoFollowObject(activity);
        const targetCollectionUri = this.extractFollowTargetCollectionUri(followActivity);
        if (!targetCollectionUri) return;

        const ownerActorUri = this.getBlockedCollectionOwnerUri(targetCollectionUri);
        if (!ownerActorUri || (recipientUri && recipientUri !== ownerActorUri)) {
          return;
        }

        const state = await this.getBlockedCollectionSharingStateByCollectionUri(ctx, targetCollectionUri);
        const followersCollectionUri =
          state.followersCollectionUri ||
          `${targetCollectionUri}${this.settings.blockedFollowersCollectionOptions.path}`;

        const followerUri = this.extractActorUri(followActivity?.actor) || this.extractActorUri(activity.actor);
        if (!followerUri) return;

        await ctx.call('activitypub.collection.remove', {
          collectionUri: followersCollectionUri,
          item: followerUri
        });
      }
    }
  },
  methods: {
    hasType(activityLike, type) {
      if (!activityLike) return false;
      const raw = activityLike.type || activityLike['@type'];
      if (Array.isArray(raw)) return raw.includes(type);
      return raw === type;
    },
    extractActorUri(value) {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        if (typeof value.id === 'string') return value.id;
        if (typeof value['@id'] === 'string') return value['@id'];
      }
      return null;
    },
    extractFollowTargetCollectionUri(activityLike) {
      if (!activityLike || typeof activityLike !== 'object') {
        return null;
      }

      const target = activityLike.object;
      if (typeof target === 'string') {
        return target;
      }

      if (target && typeof target === 'object') {
        if (typeof target.id === 'string') return target.id;
        if (typeof target['@id'] === 'string') return target['@id'];
      }

      return null;
    },
    isBlockedCollectionUri(uri) {
      if (typeof uri !== 'string' || uri.length === 0) {
        return false;
      }

      try {
        const parsed = new URL(uri);
        return BLOCKED_COLLECTION_PATH_RE.test(parsed.pathname);
      } catch {
        return false;
      }
    },
    getBlockedCollectionOwnerUri(collectionUri) {
      if (!this.isBlockedCollectionUri(collectionUri)) {
        return null;
      }
      return collectionUri.replace(/\/blocked$/, '');
    },
    async runMatcher(matcher, activity, fetcher) {
      if (typeof matcher === 'function') {
        return matcher(activity, fetcher);
      }
      return matchActivity(matcher, activity, fetcher);
    },
    async matchFollowBlockedCollection(activity, fetcher) {
      const { match, dereferencedActivity } = await this.runMatcher(
        {
          type: ACTIVITY_TYPES.FOLLOW
        },
        activity,
        fetcher
      );
      if (!match) {
        return { match, dereferencedActivity };
      }

      const targetCollectionUri = this.extractFollowTargetCollectionUri(dereferencedActivity);
      return {
        match: this.isBlockedCollectionUri(targetCollectionUri),
        dereferencedActivity
      };
    },
    async matchUndoFollowBlockedCollection(activity, fetcher) {
      const { match, dereferencedActivity } = await this.runMatcher(
        {
          type: ACTIVITY_TYPES.UNDO
        },
        activity,
        fetcher
      );
      if (!match) {
        return { match, dereferencedActivity };
      }

      const followActivity = await this.resolveUndoFollowObject(dereferencedActivity, fetcher);
      if (!this.hasType(followActivity, ACTIVITY_TYPES.FOLLOW)) {
        return { match: false, dereferencedActivity };
      }

      const targetCollectionUri = this.extractFollowTargetCollectionUri(followActivity);
      return {
        match: this.isBlockedCollectionUri(targetCollectionUri),
        dereferencedActivity: {
          ...dereferencedActivity,
          object: followActivity
        }
      };
    },
    async resolveUndoFollowObject(activity, fetcher) {
      if (!this.hasType(activity, ACTIVITY_TYPES.UNDO)) {
        return null;
      }

      if (activity?.object && typeof activity.object === 'object') {
        return activity.object;
      }

      if (typeof activity?.object === 'string' && typeof fetcher === 'function') {
        try {
          const resolved = await fetcher(activity.object);
          if (resolved && typeof resolved === 'object') {
            return resolved;
          }
        } catch {
          return null;
        }
      }

      return null;
    },
    patchDefaultFollowProcessors() {
      const sideEffects = this.broker.getLocalService('activitypub.side-effects');
      if (!sideEffects || !Array.isArray(sideEffects.processors)) {
        this.logger.warn('[blocked] activitypub.side-effects processors are not available for patching');
        return;
      }

      for (const processor of sideEffects.processors) {
        if (processor?.actionName !== 'activitypub.follow.processActivity') {
          continue;
        }
        if (!['follow', 'undoFollow'].includes(processor.key)) {
          continue;
        }
        if (processor[PATCHED_PROCESSOR_FLAG]) {
          continue;
        }

        const originalMatcher = processor.matcher;
        processor.matcher = async (activity, fetcher) => {
          const targetCollectionUri =
            processor.key === 'undoFollow'
              ? this.extractFollowTargetCollectionUri(await this.resolveUndoFollowObject(activity, fetcher))
              : this.extractFollowTargetCollectionUri(activity);

          if (this.isBlockedCollectionUri(targetCollectionUri)) {
            return {
              match: false,
              dereferencedActivity: activity
            };
          }

          return this.runMatcher(originalMatcher, activity, fetcher);
        };
        processor[PATCHED_PROCESSOR_FLAG] = true;
      }
    },
    async resolveBlockedCollectionUri(ctx, actorUri) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      if (!actor || typeof actor !== 'object') return null;

      return actor.blocked || actor['bl:blocked'] || actor[BLOCKED_PREDICATE] || null;
    },
    async resolveBlocksCollectionUri(ctx, actorUri) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      if (!actor || typeof actor !== 'object') return null;

      return actor.blocks || actor['bl:blocks'] || actor[BLOCKS_PREDICATE] || null;
    },
    async resolveBlockCollectionUris(ctx, actorUri) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      if (!actor || typeof actor !== 'object') return [];

      return [
        actor.blocked || actor['bl:blocked'] || actor[BLOCKED_PREDICATE] || null,
        actor.blocks || actor['bl:blocks'] || actor[BLOCKS_PREDICATE] || null
      ].filter(Boolean);
    },
    async ensureCollectionsForActor(ctx, actorUri) {
      await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
        objectUri: actorUri,
        collection: this.settings.blockedCollectionOptions
      });
      await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
        objectUri: actorUri,
        collection: this.settings.blocksCollectionOptions
      });

      const blockedCollectionUri = (await this.resolveBlockedCollectionUri(ctx, actorUri)) || `${actorUri}/blocked`;
      const blocksCollectionUri = (await this.resolveBlocksCollectionUri(ctx, actorUri)) || `${actorUri}/blocks`;

      await this.ensureCollectionMetadata(ctx, blockedCollectionUri, actorUri, BLOCKED_OF_PREDICATE);
      await this.ensureCollectionMetadata(ctx, blocksCollectionUri, actorUri, BLOCKS_OF_PREDICATE);

      const blockedState = await this.getBlockedCollectionSharingStateByCollectionUri(ctx, blockedCollectionUri);
      if (blockedState.public) {
        await this.ensureBlockedFollowersCollection(ctx, blockedCollectionUri, actorUri);
        await this.ensurePublicReadOnBlockedCollection(ctx, blockedCollectionUri, actorUri, true);
      }
    },
    async ensureCollectionMetadata(ctx, collectionUri, actorUri, inversePredicate) {
      await ctx.call(
        'ldp.resource.patch',
        {
          resourceUri: collectionUri,
          triplesToAdd: [
            quad(namedNode(collectionUri), namedNode(AS_ATTRIBUTED_TO_PREDICATE), namedNode(actorUri)),
            quad(namedNode(collectionUri), namedNode(inversePredicate), namedNode(actorUri))
          ]
        },
        {
          meta: {
            skipObjectsWatcher: true
          }
        }
      );
    },
    async ensureBlockedFollowersCollection(ctx, blockedCollectionUri, actorUri) {
      const existingState = await this.getBlockedCollectionSharingStateByCollectionUri(ctx, blockedCollectionUri);
      const followersCollectionUri =
        existingState.followersCollectionUri ||
        `${blockedCollectionUri}${this.settings.blockedFollowersCollectionOptions.path}`;

      const exists = await ctx.call('activitypub.collection.exist', {
        resourceUri: followersCollectionUri,
        webId: 'system'
      });

      if (!exists) {
        await ctx.call(
          'activitypub.collection.post',
          {
            resource: {
              type: 'Collection',
              summary: 'Followers of the blocked collection',
              'semapps:dereferenceItems': false
            },
            contentType: MIME_TYPES.JSON,
            webId: actorUri,
            permissions: this.settings.blockedFollowersCollectionOptions.permissions
          },
          {
            meta: {
              forcedResourceUri: followersCollectionUri
            }
          }
        );
      }

      await ctx.call(
        'ldp.resource.patch',
        {
          resourceUri: blockedCollectionUri,
          triplesToAdd: [
            quad(namedNode(blockedCollectionUri), namedNode(AS_FOLLOWERS_PREDICATE), namedNode(followersCollectionUri))
          ]
        },
        {
          meta: {
            skipObjectsWatcher: true
          }
        }
      );

      return followersCollectionUri;
    },
    async detachBlockedFollowersCollection(ctx, blockedCollectionUri) {
      const state = await this.getBlockedCollectionSharingStateByCollectionUri(ctx, blockedCollectionUri);
      if (!state.followersCollectionUri) {
        return null;
      }

      await ctx.call(
        'ldp.resource.patch',
        {
          resourceUri: blockedCollectionUri,
          triplesToRemove: [
            quad(
              namedNode(blockedCollectionUri),
              namedNode(AS_FOLLOWERS_PREDICATE),
              namedNode(state.followersCollectionUri)
            )
          ]
        },
        {
          meta: {
            skipObjectsWatcher: true
          }
        }
      );

      return state.followersCollectionUri;
    },
    async setBlockedCollectionPublicFlag(ctx, blockedCollectionUri, isPublic) {
      const trueLiteral = literal('true', namedNode(XSD_BOOLEAN));
      const patch = {
        resourceUri: blockedCollectionUri,
        triplesToRemove: [
          quad(namedNode(blockedCollectionUri), namedNode(APODS_PUBLIC_BLOCKED_COLLECTION), trueLiteral)
        ]
      };

      if (isPublic) {
        patch.triplesToAdd = [
          quad(namedNode(blockedCollectionUri), namedNode(APODS_PUBLIC_BLOCKED_COLLECTION), trueLiteral)
        ];
      }

      await ctx.call('ldp.resource.patch', patch, {
        meta: {
          skipObjectsWatcher: true
        }
      });
    },
    async ensurePublicReadOnBlockedCollection(ctx, blockedCollectionUri, actorUri, isPublic) {
      if (isPublic) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: blockedCollectionUri,
          additionalRights: {
            anon: {
              read: true
            }
          },
          webId: actorUri
        });
        return;
      }

      await ctx.call('webacl.resource.removeRights', {
        resourceUri: blockedCollectionUri,
        rights: {
          anon: {
            read: true
          }
        },
        webId: actorUri
      });
    },
    async getBlockedCollectionSharingStateForActor(ctx, actorUri) {
      const blockedCollectionUri = (await this.resolveBlockedCollectionUri(ctx, actorUri)) || `${actorUri}/blocked`;
      return this.getBlockedCollectionSharingStateByCollectionUri(ctx, blockedCollectionUri);
    },
    async getBlockedCollectionSharingStateByCollectionUri(ctx, blockedCollectionUri) {
      const rows = await ctx.call('triplestore.query', {
        query: sanitizeSparqlQuery`
          SELECT ?public ?followersCollectionUri
          WHERE {
            OPTIONAL { <${blockedCollectionUri}> <${APODS_PUBLIC_BLOCKED_COLLECTION}> ?public . }
            OPTIONAL { <${blockedCollectionUri}> <${AS_FOLLOWERS_PREDICATE}> ?followersCollectionUri . }
          }
        `,
        webId: 'system'
      });

      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      const rawPublic = first?.public?.value;
      const publicFlag = rawPublic === 'true' || rawPublic === true;
      const followersCollectionUri = first?.followersCollectionUri?.value || null;

      return {
        collectionUri: blockedCollectionUri,
        public: publicFlag,
        followersCollectionUri
      };
    },
    async setBlockedCollectionPublicState(ctx, actorUri, isPublic) {
      await this.ensureCollectionsForActor(ctx, actorUri);

      const blockedCollectionUri = (await this.resolveBlockedCollectionUri(ctx, actorUri)) || `${actorUri}/blocked`;
      if (isPublic) {
        await this.ensureBlockedFollowersCollection(ctx, blockedCollectionUri, actorUri);
      } else {
        await this.detachBlockedFollowersCollection(ctx, blockedCollectionUri);
      }

      await this.setBlockedCollectionPublicFlag(ctx, blockedCollectionUri, isPublic);
      await this.ensurePublicReadOnBlockedCollection(ctx, blockedCollectionUri, actorUri, isPublic);

      return this.getBlockedCollectionSharingStateByCollectionUri(ctx, blockedCollectionUri);
    },
    async mutateBlockCollections(ctx, actorUri, itemUri, operation) {
      const collectionUris = await this.resolveBlockCollectionUris(ctx, actorUri);

      if (collectionUris.length === 0) return;

      const uniqueCollectionUris = [...new Set(collectionUris)];
      for (const collectionUri of uniqueCollectionUris) {
        await ctx.call(`activitypub.collection.${operation}`, {
          collectionUri,
          itemUri
        });
      }
    },
    async resolveUndoneBlockActivityId(ctx, undoActivity, actorUri) {
      if (typeof undoActivity?.object === 'string') return undoActivity.object;

      if (undoActivity?.object?.id) return undoActivity.object.id;
      if (undoActivity?.object?.['@id']) return undoActivity.object['@id'];

      const targetActor = undoActivity?.object?.object;
      if (!targetActor) return null;

      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      const outboxUri = actor?.outbox;
      if (!outboxUri) return null;

      const account = await ctx.call('auth.account.findByWebId', { webId: actorUri });
      const dataset = account?.username;
      if (!dataset) return null;

      const result = await ctx.call('triplestore.query', {
        query: `
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          SELECT ?block
          WHERE {
            <${outboxUri}> as:items ?block .
            ?block a as:Block ;
                   as:object <${targetActor}> .
            OPTIONAL { ?block as:published ?published . }
          }
          ORDER BY DESC(?published)
          LIMIT 1
        `,
        webId: 'system',
        dataset
      });

      return result?.[0]?.block?.value || null;
    }
  }
};
