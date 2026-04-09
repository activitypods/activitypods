const { ActivitiesHandlerMixin, ACTIVITY_TYPES, ACTOR_TYPES } = require('@semapps/activitypub');

const BLOCKED_PREDICATE = 'https://purl.archive.org/socialweb/blocked#blocked';
const DESC_ORDER = 'http://semapps.org/ns/core#DescOrder';
const PUBLISHED_PREDICATE = 'https://www.w3.org/ns/activitystreams#published';

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
    }
  },
  dependencies: ['activitypub.collections-registry', 'activitypub.collection', 'activitypub.actor', 'auth.account'],
  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.blockedCollectionOptions);

    // Ensure existing local actors get the blocked collection without requiring a manual migration.
    const accounts = await this.broker.call('auth.account.find');
    for (const account of accounts) {
      if (!account?.webId) continue;
      await this.broker.call('activitypub.collections-registry.createAndAttachCollection', {
        objectUri: account.webId,
        collection: this.settings.blockedCollectionOptions
      });
    }
  },
  actions: {
    async updateCollectionsOptions(ctx) {
      const { dataset } = ctx.params;
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.blockedCollectionOptions,
        dataset
      });
    },
    async backfillBlockedCollections(ctx) {
      const accounts = await ctx.call('auth.account.find');
      for (const account of accounts) {
        if (!account?.webId) continue;
        await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
          objectUri: account.webId,
          collection: this.settings.blockedCollectionOptions
        });
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
        const blockedCollectionUri = await this.resolveBlockedCollectionUri(ctx, emitterUri);
        const blockActivityId = activity?.id || activity?.['@id'];

        if (!blockedCollectionUri || !blockActivityId) return;

        await ctx.call('activitypub.collection.add', {
          collectionUri: blockedCollectionUri,
          itemUri: blockActivityId
        });
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
        const blockedCollectionUri = await this.resolveBlockedCollectionUri(ctx, emitterUri);
        const blockActivityId = await this.resolveUndoneBlockActivityId(ctx, activity, emitterUri);

        if (!blockedCollectionUri || !blockActivityId) return;

        await ctx.call('activitypub.collection.remove', {
          collectionUri: blockedCollectionUri,
          itemUri: blockActivityId
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
    async resolveBlockedCollectionUri(ctx, actorUri) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      if (!actor || typeof actor !== 'object') return null;

      return actor.blocked || actor['bl:blocked'] || actor[BLOCKED_PREDICATE] || null;
    },
    async resolveUndoneBlockActivityId(ctx, undoActivity, actorUri) {
      if (typeof undoActivity?.object === 'string') return undoActivity.object;

      if (undoActivity?.object?.id) return undoActivity.object.id;
      if (undoActivity?.object?.['@id']) return undoActivity.object['@id'];

      // Some clients send inline Undo(Block) objects without an id.
      // In that case, remove the most recent local Block matching the same target.
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
