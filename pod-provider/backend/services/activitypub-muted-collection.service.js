const { ActivitiesHandlerMixin, ACTIVITY_TYPES, ACTOR_TYPES } = require('@semapps/activitypub');
const matchActivity = require('@semapps/activitypub/utils/matchActivity');
const { MIME_TYPES } = require('@semapps/mime-types');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

const MUTED_PREDICATE = 'http://activitypods.org/ns/core#muted';
const MUTED_OF_PREDICATE = 'http://activitypods.org/ns/core#mutedOf';
const APODS_PUBLIC_MUTED_COLLECTION = 'http://activitypods.org/ns/core#publicMutedCollection';
const AS_ATTRIBUTED_TO_PREDICATE = 'https://www.w3.org/ns/activitystreams#attributedTo';
const AS_FOLLOWERS_PREDICATE = 'https://www.w3.org/ns/activitystreams#followers';
const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';
const PATCHED_PROCESSOR_FLAG = '__activitypodsMutedCollectionProcessorPatched';
const MUTED_COLLECTION_PATH_RE = /^\/users\/([A-Za-z0-9._-]{1,128})\/muted$/;
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
      return Boolean(other)
        && other.termType === 'Literal'
        && other.value === value
        && other.language === ''
        && Boolean(other.datatype)
        && other.datatype.value === datatype.value;
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
      return Boolean(other)
        && other.termType === 'Quad'
        && subject.equals(other.subject)
        && predicate.equals(other.predicate)
        && object.equals(other.object)
        && graph.equals(other.graph);
    }
  };
}

module.exports = {
  name: 'activitypub.muted',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    mutedCollectionOptions: {
      path: '/muted',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: MUTED_PREDICATE,
      ordered: true,
      dereferenceItems: false,
      permissions: {}
    },
    mutedFollowersCollectionOptions: {
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
    await this.broker.call('activitypub.collections-registry.register', this.settings.mutedCollectionOptions);

    const accounts = await this.broker.call('auth.account.find');
    for (const account of accounts) {
      if (!account?.webId) continue;
      await this.ensureCollectionsForActor(this.broker, account.webId);
    }

    this.patchDefaultFollowProcessors();
  },
  actions: {
    backfillMutedCollections(ctx) {
      return this.handleBackfillMutedCollections(ctx);
    },
    getMutedCollectionSharingState: {
      params: {
        actorUri: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        return this.getMutedCollectionSharingStateForActor(ctx, ctx.params.actorUri);
      }
    },
    setMutedCollectionPublic: {
      params: {
        actorUri: { type: 'string', min: 1 },
        isPublic: { type: 'boolean', convert: true }
      },
      async handler(ctx) {
        return this.setMutedCollectionPublicState(ctx, ctx.params.actorUri, ctx.params.isPublic);
      }
    }
  },
  activities: {
    followMutedCollection: {
      priority: 5,
      async match(activity, fetcher) {
        return this.matchFollowMutedCollection(activity, fetcher);
      },
      async onReceive(ctx, activity, recipientUri) {
        const targetCollectionUri = this.extractFollowTargetCollectionUri(activity);
        if (!targetCollectionUri) return;

        const ownerActorUri = this.getMutedCollectionOwnerUri(targetCollectionUri);
        if (!ownerActorUri || (recipientUri && recipientUri !== ownerActorUri)) {
          return;
        }

        const state = await this.getMutedCollectionSharingStateByCollectionUri(ctx, targetCollectionUri);
        if (!state.public) {
          this.logger.info('[muted] ignoring Follow for private muted collection', {
            targetCollectionUri,
            actor: this.extractActorUri(activity.actor)
          });
          return;
        }

        const followerUri = this.extractActorUri(activity.actor);
        if (!followerUri) return;

        const followersCollectionUri = await this.ensureMutedFollowersCollection(ctx, targetCollectionUri, ownerActorUri);
        await ctx.call('activitypub.collection.add', {
          collectionUri: followersCollectionUri,
          item: followerUri
        });

        const ownerActor = await ctx.call('activitypub.actor.get', { actorUri: ownerActorUri });
        if (!ownerActor?.outbox) {
          this.logger.warn('[muted] unable to accept muted-collection follow because owner outbox is missing', {
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
    undoFollowMutedCollection: {
      priority: 5,
      async match(activity, fetcher) {
        return this.matchUndoFollowMutedCollection(activity, fetcher);
      },
      async onReceive(ctx, activity, recipientUri) {
        const followActivity = await this.resolveUndoFollowObject(activity);
        const targetCollectionUri = this.extractFollowTargetCollectionUri(followActivity);
        if (!targetCollectionUri) return;

        const ownerActorUri = this.getMutedCollectionOwnerUri(targetCollectionUri);
        if (!ownerActorUri || (recipientUri && recipientUri !== ownerActorUri)) {
          return;
        }

        const state = await this.getMutedCollectionSharingStateByCollectionUri(ctx, targetCollectionUri);
        const followersCollectionUri =
          state.followersCollectionUri || `${targetCollectionUri}${this.settings.mutedFollowersCollectionOptions.path}`;

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
    async handleBackfillMutedCollections(ctx) {
      const accounts = await ctx.call('auth.account.find');
      for (const account of accounts) {
        if (!account?.webId) continue;
        await this.ensureCollectionsForActor(ctx, account.webId);
      }
    },
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
    isMutedCollectionUri(uri) {
      if (typeof uri !== 'string' || uri.length === 0) {
        return false;
      }

      try {
        const parsed = new URL(uri);
        return MUTED_COLLECTION_PATH_RE.test(parsed.pathname);
      } catch {
        return false;
      }
    },
    getMutedCollectionOwnerUri(collectionUri) {
      if (!this.isMutedCollectionUri(collectionUri)) {
        return null;
      }
      return collectionUri.replace(/\/muted$/, '');
    },
    async runMatcher(matcher, activity, fetcher) {
      if (typeof matcher === 'function') {
        return matcher(activity, fetcher);
      }
      return matchActivity(matcher, activity, fetcher);
    },
    async matchFollowMutedCollection(activity, fetcher) {
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
        match: this.isMutedCollectionUri(targetCollectionUri),
        dereferencedActivity
      };
    },
    async matchUndoFollowMutedCollection(activity, fetcher) {
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
        match: this.isMutedCollectionUri(targetCollectionUri),
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
        this.logger.warn('[muted] activitypub.side-effects processors are not available for patching');
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
          const targetCollectionUri = processor.key === 'undoFollow'
            ? this.extractFollowTargetCollectionUri(await this.resolveUndoFollowObject(activity, fetcher))
            : this.extractFollowTargetCollectionUri(activity);

          if (this.isMutedCollectionUri(targetCollectionUri)) {
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
    async resolveMutedCollectionUri(ctx, actorUri) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      if (!actor || typeof actor !== 'object') return null;

      return actor.muted || actor['apods:muted'] || actor[MUTED_PREDICATE] || null;
    },
    async ensureCollectionsForActor(ctx, actorUri) {
      await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
        objectUri: actorUri,
        collection: this.settings.mutedCollectionOptions
      });

      const mutedCollectionUri = (await this.resolveMutedCollectionUri(ctx, actorUri)) || `${actorUri}/muted`;
      await this.ensureCollectionMetadata(ctx, mutedCollectionUri, actorUri, MUTED_OF_PREDICATE);

      const mutedState = await this.getMutedCollectionSharingStateByCollectionUri(ctx, mutedCollectionUri);
      if (mutedState.public) {
        await this.ensureMutedFollowersCollection(ctx, mutedCollectionUri, actorUri);
        await this.ensurePublicReadOnMutedCollection(ctx, mutedCollectionUri, actorUri, true);
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
    async ensureMutedFollowersCollection(ctx, mutedCollectionUri, actorUri) {
      const existingState = await this.getMutedCollectionSharingStateByCollectionUri(ctx, mutedCollectionUri);
      const followersCollectionUri =
        existingState.followersCollectionUri || `${mutedCollectionUri}${this.settings.mutedFollowersCollectionOptions.path}`;

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
              summary: 'Followers of the muted collection',
              'semapps:dereferenceItems': false
            },
            contentType: MIME_TYPES.JSON,
            webId: actorUri,
            permissions: this.settings.mutedFollowersCollectionOptions.permissions
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
          resourceUri: mutedCollectionUri,
          triplesToAdd: [
            quad(namedNode(mutedCollectionUri), namedNode(AS_FOLLOWERS_PREDICATE), namedNode(followersCollectionUri))
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
    async detachMutedFollowersCollection(ctx, mutedCollectionUri) {
      const state = await this.getMutedCollectionSharingStateByCollectionUri(ctx, mutedCollectionUri);
      if (!state.followersCollectionUri) {
        return null;
      }

      await ctx.call(
        'ldp.resource.patch',
        {
          resourceUri: mutedCollectionUri,
          triplesToRemove: [
            quad(
              namedNode(mutedCollectionUri),
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
    async setMutedCollectionPublicFlag(ctx, mutedCollectionUri, isPublic) {
      const trueLiteral = literal('true', namedNode(XSD_BOOLEAN));
      const patch = {
        resourceUri: mutedCollectionUri,
        triplesToRemove: [
          quad(namedNode(mutedCollectionUri), namedNode(APODS_PUBLIC_MUTED_COLLECTION), trueLiteral)
        ]
      };

      if (isPublic) {
        patch.triplesToAdd = [
          quad(namedNode(mutedCollectionUri), namedNode(APODS_PUBLIC_MUTED_COLLECTION), trueLiteral)
        ];
      }

      await ctx.call(
        'ldp.resource.patch',
        patch,
        {
          meta: {
            skipObjectsWatcher: true
          }
        }
      );
    },
    async ensurePublicReadOnMutedCollection(ctx, mutedCollectionUri, actorUri, isPublic) {
      if (isPublic) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: mutedCollectionUri,
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
        resourceUri: mutedCollectionUri,
        rights: {
          anon: {
            read: true
          }
        },
        webId: actorUri
      });
    },
    async getMutedCollectionSharingStateForActor(ctx, actorUri) {
      const mutedCollectionUri = (await this.resolveMutedCollectionUri(ctx, actorUri)) || `${actorUri}/muted`;
      return this.getMutedCollectionSharingStateByCollectionUri(ctx, mutedCollectionUri);
    },
    async getMutedCollectionSharingStateByCollectionUri(ctx, mutedCollectionUri) {
      const rows = await ctx.call('triplestore.query', {
        query: sanitizeSparqlQuery`
          SELECT ?public ?followersCollectionUri
          WHERE {
            OPTIONAL { <${mutedCollectionUri}> <${APODS_PUBLIC_MUTED_COLLECTION}> ?public . }
            OPTIONAL { <${mutedCollectionUri}> <${AS_FOLLOWERS_PREDICATE}> ?followersCollectionUri . }
          }
        `,
        webId: 'system'
      });

      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      const rawPublic = first?.public?.value;
      const publicFlag = rawPublic === 'true' || rawPublic === true;
      const followersCollectionUri = first?.followersCollectionUri?.value || null;

      return {
        collectionUri: mutedCollectionUri,
        public: publicFlag,
        followersCollectionUri
      };
    },
    async setMutedCollectionPublicState(ctx, actorUri, isPublic) {
      await this.ensureCollectionsForActor(ctx, actorUri);

      const mutedCollectionUri = (await this.resolveMutedCollectionUri(ctx, actorUri)) || `${actorUri}/muted`;
      if (isPublic) {
        await this.ensureMutedFollowersCollection(ctx, mutedCollectionUri, actorUri);
      } else {
        await this.detachMutedFollowersCollection(ctx, mutedCollectionUri);
      }

      await this.setMutedCollectionPublicFlag(ctx, mutedCollectionUri, isPublic);
      await this.ensurePublicReadOnMutedCollection(ctx, mutedCollectionUri, actorUri, isPublic);

      return this.getMutedCollectionSharingStateByCollectionUri(ctx, mutedCollectionUri);
    }
  }
};
