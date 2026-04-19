const {
  AS_PUBLIC,
  getIndexableValue,
  getSearchableBy,
  normalizeActorSearchConsentForOutput,
  resolvePublicSearchConsent
} = require('../utils/search-consent');

describe('search consent utilities', () => {
  test('treats empty searchableBy arrays as semantically undefined', () => {
    expect(getSearchableBy({ searchableBy: [] })).toEqual([]);
  });

  test('gives object searchableBy precedence over actor indexable', () => {
    const consent = resolvePublicSearchConsent(
      {
        type: 'Note',
        to: [AS_PUBLIC],
        searchableBy: 'https://example.com/users/alice'
      },
      {
        attributedToActor: {
          id: 'https://example.com/users/bob',
          indexable: true
        }
      }
    );

    expect(consent.source).toBe('object_searchableBy');
    expect(consent.isPublic).toBe(false);
    expect(consent.objectSearchableBy).toEqual(['https://example.com/users/alice']);
  });

  test('inherits actor searchableBy when object omits the property', () => {
    const consent = resolvePublicSearchConsent(
      {
        type: 'Note',
        to: [AS_PUBLIC]
      },
      {
        attributedToActor: {
          id: 'https://example.com/users/alice',
          searchableBy: AS_PUBLIC
        }
      }
    );

    expect(consent.source).toBe('actor_searchableBy');
    expect(consent.isPublic).toBe(true);
  });

  test('falls back to actor indexable when searchableBy is absent', () => {
    const consent = resolvePublicSearchConsent(
      {
        type: 'Note',
        to: [AS_PUBLIC]
      },
      {
        attributedToActor: {
          id: 'https://example.com/users/alice',
          indexable: true
        }
      }
    );

    expect(consent.source).toBe('actor_indexable');
    expect(consent.isPublic).toBe(true);
    expect(consent.actorIndexable).toBe(true);
  });

  test('fails closed for public indexing when no explicit signal is present', () => {
    const consent = resolvePublicSearchConsent({
      type: 'Note',
      to: [AS_PUBLIC]
    });

    expect(consent.source).toBe('none');
    expect(consent.isPublic).toBe(false);
    expect(consent.explicitlySet).toBe(false);
  });

  test('normalizes actor output and defaults missing consent to indexable false', () => {
    const actor = normalizeActorSearchConsentForOutput({
      id: 'https://example.com/users/alice',
      type: 'Person',
      preferredUsername: 'alice',
      '@context': ['https://www.w3.org/ns/activitystreams']
    });

    expect(actor.searchableBy).toBeUndefined();
    expect(actor.indexable).toBe(false);
    expect(Array.isArray(actor['@context'])).toBe(true);
    expect(actor['@context']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toot: 'http://joinmastodon.org/ns#',
          indexable: 'toot:indexable'
        })
      ])
    );
  });

  test('keeps explicit actor indexable values', () => {
    expect(getIndexableValue({ indexable: true })).toBe(true);
    expect(getIndexableValue({ 'http://joinmastodon.org/ns#indexable': false })).toBe(false);
  });
});
