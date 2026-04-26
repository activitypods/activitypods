'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const { namedNode, triple } = require('@rdfjs/data-model');
const { retryWithBackoff } = require('../utils/backoff');

const AS_CONTEXT_PREDICATE = 'https://www.w3.org/ns/activitystreams#context';
const AS_ATTRIBUTED_TO_PREDICATE = 'https://www.w3.org/ns/activitystreams#attributedTo';
const FEP_F228_CONTEXT_HISTORY_PREDICATE = 'https://w3id.org/fep/f228#contextHistory';
const FEP_BAD1_HISTORY_PREDICATE = 'https://w3id.org/fep/bad1#history';
const PUBLISHED_PREDICATE = 'https://www.w3.org/ns/activitystreams#published';
const ASC_ORDER = 'http://semapps.org/ns/core#AscOrder';

const NOTE_LIKE_TYPES = new Set(['Note', 'Article', 'Page', 'Question']);
const SUPPORTED_ACTIVITY_TYPES = new Set(['Create', 'Update', 'Delete', 'Like', 'Add', 'Remove']);

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
  name: 'activitypub.conversation-context',

  settings: {
    postCollectionOptions: {
      path: '/context',
      attachToTypes: ['Note', 'Article', 'Page', 'Question'],
      attachPredicate: AS_CONTEXT_PREDICATE,
      ordered: true,
      dereferenceItems: true,
      sortPredicate: PUBLISHED_PREDICATE,
      sortOrder: ASC_ORDER,
      permissions: {}
    },
    historyCollectionOptions: {
      path: '/context/history',
      attachToTypes: ['Note', 'Article', 'Page', 'Question'],
      attachPredicate: FEP_F228_CONTEXT_HISTORY_PREDICATE,
      ordered: true,
      dereferenceItems: true,
      sortPredicate: PUBLISHED_PREDICATE,
      sortOrder: ASC_ORDER,
      permissions: {}
    }
  },

  dependencies: ['activitypub.collections-registry', 'activitypub.collection', 'auth.account'],

  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.postCollectionOptions);
    await this.broker.call('activitypub.collections-registry.register', this.settings.historyCollectionOptions);
  },

  events: {
    'activitypub.outbox.posted': {
      async handler(ctx) {
        const activity = ctx.params?.activity;
        if (!activity || typeof activity !== 'object') return;

        const activityType = this.getActivityType(activity);
        if (!SUPPORTED_ACTIVITY_TYPES.has(activityType)) return;

        const actorUri = this.getActorUri(activity);
        if (!actorUri) return;

        const account = await ctx.call('auth.account.findByWebId', { webId: actorUri }).catch(() => null);
        if (!account?.username) return;

        const object = this.getObject(activity);
        const objectUri = this.getObjectUri(object);

        const rootObjectUri = await this.resolveConversationRootUri(ctx, {
          activity,
          object,
          objectUri,
          actorUri,
          dataset: account.username
        });

        if (!rootObjectUri) return;

        try {
          const { contextCollectionUri, historyCollectionUri } = await this.ensureConversationCollections(
            ctx,
            rootObjectUri,
            actorUri,
            account.username
          );

          // Keep the posts collection linked to its activity-history collection (FEP-bad1 style).
          await this.attachHistoryPointer(ctx, {
            contextCollectionUri,
            historyCollectionUri,
            dataset: account.username
          });

          // FEP-7888 §"Dereferencing and resolving": set `attributedTo` on the
          // context collection so consumers can identify the context owner.
          // We only do this when the root post belongs to this local actor —
          // i.e., when objectUri === rootObjectUri (this IS the root post) —
          // to avoid overwriting attribution when a replier triggers collection
          // creation for a root they don't own.
          if (this.isNoteLikeObject(object) && objectUri === rootObjectUri) {
            await this.attachContextCollectionAttributedTo(ctx, {
              contextCollectionUri,
              actorUri,
              dataset: account.username
            });
          }

          if (this.isNoteLikeObject(object) && objectUri) {
            await this.addCollectionItem(ctx, {
              collectionUri: contextCollectionUri,
              itemUri: objectUri,
              actorUri,
              dataset: account.username
            });
          }

          const activityUri = this.getObjectUri(activity);
          if (activityUri) {
            await this.addCollectionItem(ctx, {
              collectionUri: historyCollectionUri,
              itemUri: activityUri,
              actorUri,
              dataset: account.username
            });
          }
        } catch (error) {
          this.logger.warn('[conversation-context] failed to update conversation collections', {
            error: error?.message,
            activityType,
            actorUri,
            rootObjectUri
          });
        }
      }
    }
  },

  methods: {
    getActivityType(activity) {
      const raw = activity?.type || activity?.['@type'];
      if (Array.isArray(raw)) {
        return typeof raw[0] === 'string' ? raw[0] : '';
      }
      return typeof raw === 'string' ? raw : '';
    },

    getActorUri(activity) {
      const actor = activity?.actor;
      if (typeof actor === 'string' && actor.trim().length > 0) return actor;
      if (actor && typeof actor === 'object') {
        const id = actor.id || actor['@id'];
        if (typeof id === 'string' && id.trim().length > 0) return id;
      }
      return null;
    },

    getObject(activity) {
      const object = activity?.object;
      if (!object) return null;
      if (typeof object === 'string') return object;
      if (typeof object === 'object' && !Array.isArray(object)) return object;
      return null;
    },

    getObjectUri(value) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (value && typeof value === 'object') {
        const id = value.id || value['@id'];
        if (typeof id === 'string' && id.trim().length > 0) return id;
      }
      return null;
    },

    isNoteLikeObject(value) {
      if (!value || typeof value !== 'object') return false;
      const raw = value.type || value['@type'];
      if (typeof raw === 'string') return NOTE_LIKE_TYPES.has(raw);
      if (Array.isArray(raw)) return raw.some(type => typeof type === 'string' && NOTE_LIKE_TYPES.has(type));
      return false;
    },

    extractContextCollectionUri(object) {
      if (!object || typeof object !== 'object') return null;
      const context = object.context;
      if (typeof context === 'string' && context.trim().length > 0) return context;
      if (context && typeof context === 'object') {
        const id = context.id || context['@id'];
        if (typeof id === 'string' && id.trim().length > 0) return id;
      }
      return null;
    },

    extractInReplyToUri(object) {
      if (!object || typeof object !== 'object') return null;
      const inReplyTo = object.inReplyTo;
      if (typeof inReplyTo === 'string' && inReplyTo.trim().length > 0) return inReplyTo;
      if (inReplyTo && typeof inReplyTo === 'object') {
        const id = inReplyTo.id || inReplyTo['@id'];
        if (typeof id === 'string' && id.trim().length > 0) return id;
      }
      return null;
    },

    deriveRootFromContextCollection(contextCollectionUri) {
      if (typeof contextCollectionUri !== 'string') return null;
      const normalized = contextCollectionUri.trim().replace(/\/$/, '');
      if (normalized.endsWith('/context')) {
        return normalized.slice(0, -'/context'.length);
      }
      return null;
    },

    async resolveConversationRootUri(ctx, { activity, object, objectUri, actorUri, dataset }) {
      if (this.isNoteLikeObject(object) && objectUri) {
        const contextCollectionUri = this.extractContextCollectionUri(object);
        const rootFromContext = this.deriveRootFromContextCollection(contextCollectionUri);
        if (rootFromContext) return rootFromContext;

        const inReplyToUri = this.extractInReplyToUri(object);
        if (inReplyToUri) {
          const parent = await this.loadResource(ctx, inReplyToUri, dataset).catch(() => null);
          const parentContext = this.extractContextCollectionUri(parent);
          const parentRoot = this.deriveRootFromContextCollection(parentContext);
          return parentRoot || inReplyToUri;
        }

        return objectUri;
      }

      // For non-post activities (Like/Delete/Add/Remove), try resolving from the target object.
      const candidateObjectUri = objectUri;
      if (!candidateObjectUri) return null;

      const target = await this.loadResource(ctx, candidateObjectUri, dataset).catch(() => null);
      if (!target) {
        // Best effort fallback: use the target URI itself as root.
        return candidateObjectUri;
      }

      const targetContext = this.extractContextCollectionUri(target);
      const targetRoot = this.deriveRootFromContextCollection(targetContext);
      if (targetRoot) return targetRoot;

      const targetInReplyTo = this.extractInReplyToUri(target);
      if (targetInReplyTo) {
        const parent = await this.loadResource(ctx, targetInReplyTo, dataset).catch(() => null);
        const parentContext = this.extractContextCollectionUri(parent);
        const parentRoot = this.deriveRootFromContextCollection(parentContext);
        return parentRoot || targetInReplyTo;
      }

      const actorContext = this.extractContextCollectionUri(activity);
      const actorRoot = this.deriveRootFromContextCollection(actorContext);
      if (actorRoot) return actorRoot;

      return candidateObjectUri;
    },

    async loadResource(ctx, resourceUri, dataset) {
      return ctx.call(
        'ldp.resource.get',
        {
          resourceUri,
          accept: MIME_TYPES.JSON,
          webId: 'system'
        },
        { meta: { dataset, webId: 'system' } }
      );
    },

    async ensureConversationCollections(ctx, rootObjectUri, actorUri, dataset) {
      const contextCollectionUri = await retryWithBackoff(
        async () =>
          ctx.call(
            'activitypub.collections-registry.createAndAttachCollection',
            {
              objectUri: rootObjectUri,
              collection: this.settings.postCollectionOptions
            },
            { meta: { webId: actorUri, dataset } }
          ),
        {
          maxRetries: 3,
          baseDelayMs: 100,
          maxDelayMs: 1500,
          retryIf: err => err?.code === 429 || err?.code >= 500
        }
      );

      const historyCollectionUri = await retryWithBackoff(
        async () =>
          ctx.call(
            'activitypub.collections-registry.createAndAttachCollection',
            {
              objectUri: rootObjectUri,
              collection: this.settings.historyCollectionOptions
            },
            { meta: { webId: actorUri, dataset } }
          ),
        {
          maxRetries: 3,
          baseDelayMs: 100,
          maxDelayMs: 1500,
          retryIf: err => err?.code === 429 || err?.code >= 500
        }
      );

      return { contextCollectionUri, historyCollectionUri };
    },

    async attachHistoryPointer(ctx, { contextCollectionUri, historyCollectionUri, dataset }) {
      await retryWithBackoff(
        async () =>
          ctx.call(
            'ldp.resource.patch',
            {
              resourceUri: contextCollectionUri,
              triplesToAdd: [
                triple(
                  namedNode(contextCollectionUri),
                  namedNode(FEP_BAD1_HISTORY_PREDICATE),
                  namedNode(historyCollectionUri)
                )
              ],
              webId: 'system'
            },
            { meta: { dataset, webId: 'system' } }
          ),
        {
          maxRetries: 2,
          baseDelayMs: 50,
          maxDelayMs: 500,
          retryIf: err => err?.code === 429 || err?.code >= 500
        }
      ).catch(error => {
        this.logger.debug('[conversation-context] failed to attach history pointer', {
          contextCollectionUri,
          historyCollectionUri,
          error: error?.message
        });
      });
    },

    /**
     * FEP-7888 §"Dereferencing and resolving": patch the context collection to
     * carry `attributedTo` pointing to the root post's author.  This lets
     * remote consumers identify the context owner and CC them when interacting
     * within the same context.
     *
     * Applied only when the local actor created the root post, so attribution
     * is never overwritten by a replier who happens to trigger collection
     * initialisation first.
     */
    async attachContextCollectionAttributedTo(ctx, { contextCollectionUri, actorUri, dataset }) {
      await retryWithBackoff(
        async () =>
          ctx.call(
            'ldp.resource.patch',
            {
              resourceUri: contextCollectionUri,
              triplesToAdd: [
                triple(namedNode(contextCollectionUri), namedNode(AS_ATTRIBUTED_TO_PREDICATE), namedNode(actorUri))
              ],
              webId: 'system'
            },
            { meta: { dataset, webId: 'system' } }
          ),
        {
          maxRetries: 2,
          baseDelayMs: 50,
          maxDelayMs: 500,
          retryIf: err => err?.code === 429 || err?.code >= 500
        }
      ).catch(error => {
        this.logger.debug('[conversation-context] failed to attach attributedTo to context collection', {
          contextCollectionUri,
          actorUri,
          error: error?.message
        });
      });
    },

    async addCollectionItem(ctx, { collectionUri, itemUri, actorUri, dataset }) {
      await retryWithBackoff(
        async () => {
          const alreadyPresent = await ctx
            .call('activitypub.collection.includes', { collectionUri, itemUri }, { meta: { webId: actorUri, dataset } })
            .catch(() => false);

          if (alreadyPresent) return;

          await ctx.call(
            'activitypub.collection.add',
            { collectionUri, itemUri },
            { meta: { webId: actorUri, dataset } }
          );
        },
        {
          maxRetries: 3,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          retryIf: err => err?.code === 429 || err?.code >= 500
        }
      );
    }
  }
};
