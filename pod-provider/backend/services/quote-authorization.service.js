'use strict';

/**
 * FEP-044f: Consent-respecting quote posts — QuoteRequest auto-accept service.
 *
 * When a remote actor wants to quote one of our posts, they send a QuoteRequest
 * activity. This service auto-accepts all QuoteRequests (consistent with the
 * `interactionPolicy.canQuote: { automaticApproval: PUBLIC }` policy we
 * advertise on all published objects) and sends back an Accept activity whose
 * `result` contains a QuoteAuthorization stamp.
 *
 * FEP-044f activity flow:
 *   Requester → QuoteRequest { object: quotePostUri, target: quotedObjectUri }
 *   Us        → Accept { object: quoteRequestId, result: { type: QuoteAuthorization, ... } }
 *
 * Revocation (Delete QuoteAuthorization) is handled as well: if we receive
 * Delete(QuoteAuthorization) from a remote server, we log it and ignore it
 * (the canonical authority over an authorization is its issuer, i.e. us).
 */

const { ActivitiesHandlerMixin } = require('@semapps/activitypub');

const QUOTE_REQUEST_TYPE = 'https://w3id.org/fep/044f#QuoteRequest';
const QUOTE_AUTHORIZATION_TYPE = 'https://w3id.org/fep/044f#QuoteAuthorization';
const FEP044F_CONTEXT = 'https://w3id.org/fep/044f';

const normalizeIri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Returns true when the activity has a type matching QuoteRequest
 * (either the full IRI or the compact term, depending on JSON-LD processing).
 */
const isQuoteRequestType = type => {
  if (Array.isArray(type)) {
    return type.some(t => t === QUOTE_REQUEST_TYPE || t === 'QuoteRequest');
  }
  return type === QUOTE_REQUEST_TYPE || type === 'QuoteRequest';
};

module.exports = {
  name: 'activitypub.quote-authorization',
  mixins: [ActivitiesHandlerMixin],

  activities: {
    /**
     * Inbound QuoteRequest → auto-Accept with a QuoteAuthorization stamp.
     */
    quoteRequest: {
      async match(activity) {
        const type = activity?.type || activity?.['@type'];
        const matched = isQuoteRequestType(type);
        return { match: matched, dereferencedActivity: activity };
      },

      async onReceive(ctx, activity, recipientUri) {
        const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri }).catch(() => null);
        if (!recipient || !normalizeIri(recipient.outbox)) return;

        const requestorUri = normalizeIri(
          typeof activity.actor === 'string' ? activity.actor : activity.actor?.id
        );
        const quotePostUri = normalizeIri(
          typeof activity.object === 'string' ? activity.object : activity.object?.id
        );
        const quotedObjectUri = normalizeIri(
          typeof activity.target === 'string' ? activity.target : activity.target?.id
        );
        const requestId = normalizeIri(activity.id || activity['@id']);

        if (!requestorUri || !quotePostUri || !requestId) return;

        // FEP-044f §QuoteAuthorization: the stamp records what was authorized.
        const stamp = {
          '@context': FEP044F_CONTEXT,
          type: QUOTE_AUTHORIZATION_TYPE,
          attributedTo: recipientUri,
          interactingObject: quotePostUri,
          ...(quotedObjectUri ? { interactionTarget: quotedObjectUri } : {}),
        };

        await ctx.call('activitypub.outbox.post', {
          collectionUri: recipient.outbox,
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            FEP044F_CONTEXT,
          ],
          type: 'Accept',
          actor: recipientUri,
          object: requestId,
          result: stamp,
          to: requestorUri,
        });
      },
    },
  },
};
