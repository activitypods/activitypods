'use strict';

/**
 * MLS Messages Service
 *
 * Stores and retrieves encrypted MLS messages for local actors in support of
 * the ActivityPub E2EE MLS spec (https://swicg.github.io/activitypub-e2ee/mls.html).
 *
 * The sidecar receives POST /users/:id/messages from remote actors, verifies
 * the HTTP Signature, and forwards to this service.  The service stores the
 * encrypted bytes in the actor's named graph — it never decrypts content.
 *
 * Message types accepted (RFC 9420 + AP E2EE spec):
 *   PublicMessage   — encrypted group message for group members
 *   PrivateMessage  — encrypted direct message
 *   Welcome         — MLS Welcome for a new group member
 *   GroupInfo       — MLS GroupInfo for external joiners
 *
 * Actions:
 *   mls.messages.deliver({ actorUri, senderUri, type, content, externalId? })
 *     → { id, type, senderUri, content, publishedAt }
 *   mls.messages.list({ actorUri })
 *     → [{ id, type, senderUri, content, publishedAt }]
 *   mls.messages.delete({ actorUri, messageId })
 *     → void
 */

const crypto = require('crypto');
const { getDatasetFromUri } = require('@semapps/ldp');
const { retryWithBackoff } = require('../utils/backoff');

const MLS_NS = 'https://purl.archive.org/socialweb/mls#';
const DCTERMS_NS = 'http://purl.org/dc/terms/';
const AS_NS = 'https://www.w3.org/ns/activitystreams#';

// UUID v4 for internal messageId validation
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Accepted MLS message types per AP E2EE spec
const VALID_MLS_TYPES = new Set(['PublicMessage', 'PrivateMessage', 'Welcome', 'GroupInfo']);

// Base64 alphabet validation (strict — only characters in RFC 4648)
const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;

function isRetryable(err) {
  const code = Number(err?.code);
  if (err?.name === 'TimeoutError') return true;
  if (Number.isFinite(code) && (code === 408 || code === 425 || code === 429 || code >= 500)) return true;
  return /timeout|temporar|unavailable|econn|socket/i.test(String(err?.message || ''));
}

function sparqlStr(value) {
  return JSON.stringify(String(value));
}

function messagesGraph(actorUri) {
  return `${actorUri.replace(/\/$/, '')}/mls-messages`;
}

function messageNodeUri(actorUri, id) {
  return `${actorUri.replace(/\/$/, '')}/mls-messages/${id}`;
}

function readBinding(row, key) {
  const v = row?.[key];
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.value === 'string') return v.value;
  return null;
}

module.exports = {
  name: 'mls.messages',

  dependencies: ['triplestore', 'auth.account', 'activitypub.actor'],

  methods: {
    async triQuery(ctx, query, dataset) {
      return retryWithBackoff(() => ctx.call('triplestore.query', { query, dataset, webId: 'system' }), {
        maxRetries: 3,
        baseDelayMs: 60,
        maxDelayMs: 1200,
        retryIf: isRetryable
      });
    },

    async triUpdate(ctx, query, dataset) {
      return retryWithBackoff(() => ctx.call('triplestore.update', { query, dataset, webId: 'system' }), {
        maxRetries: 3,
        baseDelayMs: 60,
        maxDelayMs: 1200,
        retryIf: isRetryable
      });
    },

    requireActorUri(actorUri) {
      if (!actorUri || typeof actorUri !== 'string') throw new Error('actorUri is required');
      try {
        const p = new URL(actorUri);
        if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error();
      } catch {
        throw new Error(`actorUri must be a valid http(s) URL: ${actorUri}`);
      }
    },

    requireSenderUri(senderUri) {
      if (!senderUri || typeof senderUri !== 'string') throw new Error('senderUri is required');
      try {
        const p = new URL(senderUri);
        if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error();
      } catch {
        throw new Error(`senderUri must be a valid http(s) URL: ${senderUri}`);
      }
    }
  },

  actions: {
    /**
     * Store an incoming encrypted MLS message delivered to an actor.
     * The service stores the ciphertext; it never decrypts.
     */
    async deliver(ctx) {
      const { actorUri, senderUri, type, content, externalId } = ctx.params;

      this.requireActorUri(actorUri);
      this.requireSenderUri(senderUri);

      if (!VALID_MLS_TYPES.has(type)) {
        throw new Error(`Invalid MLS message type: ${type}`);
      }
      if (!content || typeof content !== 'string') {
        throw new Error('content is required');
      }
      if (!BASE64_RE.test(content)) {
        throw new Error('content must be valid base64');
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const dataset = getDatasetFromUri(actorUri);
      const graph = messagesGraph(actorUri);
      const nodeUri = messageNodeUri(actorUri, id);

      const externalIdTriple =
        externalId && typeof externalId === 'string' ? `mls:externalId ${sparqlStr(externalId)} ;` : '';

      await this.triUpdate(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        PREFIX dcterms: <${DCTERMS_NS}>
        PREFIX as: <${AS_NS}>
        INSERT DATA {
          GRAPH <${graph}> {
            <${nodeUri}>
              a mls:${type} ;
              mls:messageId ${sparqlStr(id)} ;
              mls:messageType ${sparqlStr(type)} ;
              as:attributedTo <${senderUri}> ;
              mls:content ${sparqlStr(content)} ;
              mls:mediaType "message/mls" ;
              mls:encoding "base64" ;
              ${externalIdTriple}
              dcterms:created ${sparqlStr(now)} .
          }
        }
      `,
        dataset
      );

      this.logger.debug('[mls.messages] message stored', { actorUri, id, type, senderUri });

      return { id, type, senderUri, content, publishedAt: now };
    },

    /**
     * List all stored messages for an actor, newest first.
     * Returns public metadata + ciphertext; private keys never stored here.
     */
    async list(ctx) {
      const { actorUri } = ctx.params;
      this.requireActorUri(actorUri);

      const dataset = getDatasetFromUri(actorUri);
      const graph = messagesGraph(actorUri);

      const rows = await this.triQuery(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        PREFIX dcterms: <${DCTERMS_NS}>
        PREFIX as: <${AS_NS}>
        SELECT ?id ?type ?senderUri ?content ?created WHERE {
          GRAPH <${graph}> {
            ?node mls:messageId ?id ;
              mls:messageType ?type ;
              as:attributedTo ?senderUri ;
              mls:content ?content ;
              dcterms:created ?created .
          }
        }
        ORDER BY DESC(?created)
      `,
        dataset
      );

      return (Array.isArray(rows) ? rows : [])
        .map(row => ({
          id: readBinding(row, 'id'),
          type: readBinding(row, 'type'),
          senderUri: readBinding(row, 'senderUri'),
          content: readBinding(row, 'content'),
          publishedAt: readBinding(row, 'created')
        }))
        .filter(item => item.id && item.content);
    },

    /**
     * Hard-delete a specific message from an actor's message store.
     */
    async delete(ctx) {
      const { actorUri, messageId } = ctx.params;
      this.requireActorUri(actorUri);

      if (!messageId || typeof messageId !== 'string') throw new Error('messageId is required');
      if (!UUID_V4_RE.test(messageId)) throw new Error('messageId must be a valid UUID v4');

      const dataset = getDatasetFromUri(actorUri);
      const graph = messagesGraph(actorUri);
      const nodeUri = messageNodeUri(actorUri, messageId);

      await this.triUpdate(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        WITH <${graph}>
        DELETE { <${nodeUri}> ?p ?o }
        WHERE  { <${nodeUri}> ?p ?o }
      `,
        dataset
      );

      this.logger.debug('[mls.messages] message deleted', { actorUri, messageId });
    }
  }
};
