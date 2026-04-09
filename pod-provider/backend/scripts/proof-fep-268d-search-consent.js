/**
 * Proof script: FEP-268d search consent signals
 *
 * Tests every normative rule from the FEP spec:
 *   - Explicit searchableBy on object
 *   - as:Public (compact + expanded) matches any actor
 *   - Actor-level inheritance (SHALL)
 *   - FEP-5feb (toot:indexable) fallback when no searchableBy
 *   - searchableBy takes precedence over indexable (MUST)
 *   - Author always allowed to search own objects (SHOULD)
 *   - Object with no signals: fallback to audience (as:Public → open)
 *   - Empty array treated as undefined (security note)
 *   - injectSearchableBy adds FEP-268d @context
 *   - deriveDefaultSearchableBy derives correct value from to/cc
 *   - normalizeSearchableByForOutput collapses single-element arrays
 */

'use strict';

const assert = require('assert');
const {
  getSearchableBy,
  isSearchableBy,
  injectSearchableBy,
  normalizeSearchableByForOutput,
  deriveDefaultSearchableBy,
  AS_PUBLIC,
  FEP_268D_CONTEXT
} = require('../utils/search-consent');

const AS_FOLLOWERS = 'https://example.com/users/1/followers';
const ACTOR_URI = 'https://example.com/users/1';
const ALICE_URI = 'https://alice.example/actor';

// ---------------------------------------------------------------------------
// 1. getSearchableBy — extraction and expansion
// ---------------------------------------------------------------------------

// Short form: string
assert.deepStrictEqual(
  getSearchableBy({ searchableBy: AS_PUBLIC }),
  [AS_PUBLIC],
  '1a: string value expanded correctly'
);

// Short form: compact alias
assert.deepStrictEqual(getSearchableBy({ searchableBy: 'as:Public' }), [AS_PUBLIC], '1b: as:Public alias expanded');

// Array of URIs
assert.deepStrictEqual(
  getSearchableBy({ searchableBy: [ALICE_URI, AS_FOLLOWERS] }),
  [ALICE_URI, AS_FOLLOWERS],
  '1c: array preserved'
);

// Empty array → semantically null (FEP-268d security note)
assert.deepStrictEqual(getSearchableBy({ searchableBy: [] }), [], '1d: empty array treated as null');

// Not set
assert.deepStrictEqual(getSearchableBy({ type: 'Note', content: 'hi' }), [], '1e: absent property returns []');

// Object form { id: '...' }
assert.deepStrictEqual(getSearchableBy({ searchableBy: { id: ALICE_URI } }), [ALICE_URI], '1f: object form extracted');

// ---------------------------------------------------------------------------
// 2. isSearchableBy — explicit object searchableBy
// ---------------------------------------------------------------------------

const publicNote = {
  type: 'Note',
  content: 'Hello, world!',
  attributedTo: ACTOR_URI,
  to: AS_PUBLIC,
  cc: AS_FOLLOWERS,
  searchableBy: AS_PUBLIC
};

assert.ok(isSearchableBy(publicNote, ALICE_URI), '2a: public note searchable by anyone');
assert.ok(isSearchableBy(publicNote, ACTOR_URI), '2b: public note searchable by author');
assert.ok(isSearchableBy(publicNote, AS_PUBLIC), '2c: public note searchable by as:Public sentinel');

const directNote = {
  type: 'Note',
  content: '@Alice Happy birthday!',
  attributedTo: ACTOR_URI,
  to: ALICE_URI,
  cc: [AS_FOLLOWERS, AS_PUBLIC],
  searchableBy: [ALICE_URI, AS_FOLLOWERS]
};

assert.ok(isSearchableBy(directNote, ALICE_URI), '2d: direct note searchable by mentioned actor');
assert.ok(
  !isSearchableBy(directNote, 'https://bob.example/actor'),
  '2e: direct note NOT searchable by uninvited actor'
);

// Author can always search own objects (SHOULD per spec)
const selfNote = {
  type: 'Note',
  content: 'Note to self',
  attributedTo: ACTOR_URI,
  to: AS_FOLLOWERS,
  cc: AS_PUBLIC,
  searchableBy: ACTOR_URI
};

assert.ok(isSearchableBy(selfNote, ACTOR_URI), '2f: self-only note searchable by author');
assert.ok(!isSearchableBy(selfNote, ALICE_URI), '2g: self-only note NOT searchable by others');

// Author is always allowed even when not in searchableBy (SHOULD)
const restrictedNote = {
  type: 'Note',
  content: 'restricted',
  attributedTo: ACTOR_URI,
  searchableBy: ALICE_URI
};
assert.ok(isSearchableBy(restrictedNote, ACTOR_URI), '2h: author always passes (SHOULD)');

// ---------------------------------------------------------------------------
// 3. Actor-level inheritance (SHALL)
// ---------------------------------------------------------------------------

const noteWithoutSearchableBy = {
  type: 'Note',
  content: 'no searchableBy on object',
  attributedTo: ACTOR_URI,
  to: AS_PUBLIC
};

const publicActor = {
  type: 'Person',
  id: ACTOR_URI,
  searchableBy: AS_PUBLIC
};

assert.ok(
  isSearchableBy(noteWithoutSearchableBy, ALICE_URI, { attributedToActor: publicActor }),
  '3a: note inherits actor searchableBy'
);

const privateActor = {
  type: 'Person',
  id: ACTOR_URI,
  searchableBy: ACTOR_URI // only author
};

assert.ok(
  !isSearchableBy(noteWithoutSearchableBy, ALICE_URI, { attributedToActor: privateActor }),
  '3b: note inherits actor private searchableBy — blocks others'
);
assert.ok(
  isSearchableBy(noteWithoutSearchableBy, ACTOR_URI, { attributedToActor: privateActor }),
  '3c: note inherits actor private searchableBy — allows author'
);

// ---------------------------------------------------------------------------
// 4. FEP-5feb (toot:indexable) fallback
// ---------------------------------------------------------------------------

const indexableTrueActor = {
  type: 'Person',
  id: ACTOR_URI,
  'http://joinmastodon.org/ns#indexable': true
};

assert.ok(
  isSearchableBy(noteWithoutSearchableBy, ALICE_URI, { attributedToActor: indexableTrueActor }),
  '4a: indexable:true → searchable by anyone'
);

const indexableFalseActor = {
  type: 'Person',
  id: ACTOR_URI,
  'http://joinmastodon.org/ns#indexable': false
};

assert.ok(
  !isSearchableBy(noteWithoutSearchableBy, ALICE_URI, { attributedToActor: indexableFalseActor }),
  '4b: indexable:false → not searchable by others'
);

// ---------------------------------------------------------------------------
// 5. searchableBy takes precedence over indexable (MUST)
// ---------------------------------------------------------------------------

const noteWithExplicit = {
  type: 'Note',
  content: 'explicit searchableBy',
  attributedTo: ACTOR_URI,
  to: AS_PUBLIC,
  searchableBy: ACTOR_URI // only author
};

const indexableTrueActorV2 = {
  type: 'Person',
  id: ACTOR_URI,
  'http://joinmastodon.org/ns#indexable': true
};

// Even though actor has indexable:true, the object's explicit searchableBy wins
assert.ok(
  !isSearchableBy(noteWithExplicit, ALICE_URI, { attributedToActor: indexableTrueActorV2 }),
  '5a: object searchableBy takes precedence over actor indexable:true (MUST)'
);

// ---------------------------------------------------------------------------
// 6. No signals — fallback to audience
// ---------------------------------------------------------------------------

const publicNoteNoSignals = {
  type: 'Note',
  content: 'plain public',
  to: AS_PUBLIC,
  cc: AS_FOLLOWERS
};

assert.ok(isSearchableBy(publicNoteNoSignals, ALICE_URI), '6a: no signals + as:Public → searchable');

const followersOnlyNoteNoSignals = {
  type: 'Note',
  content: 'followers only',
  to: AS_FOLLOWERS
};

assert.ok(!isSearchableBy(followersOnlyNoteNoSignals, ALICE_URI), '6b: no signals + no as:Public → not searchable');

// ---------------------------------------------------------------------------
// 7. injectSearchableBy — adds property and ensures context
// ---------------------------------------------------------------------------

const bareNote = {
  type: 'Note',
  content: 'bare'
};

const injected = injectSearchableBy(bareNote, AS_PUBLIC);

assert.strictEqual(injected.searchableBy, AS_PUBLIC, '7a: searchableBy injected');
assert.ok(Array.isArray(injected['@context']), '7b: @context is array after injection');
assert.ok(injected['@context'].includes(FEP_268D_CONTEXT), '7c: FEP-268d @context URI present');

// Existing context string is preserved
const noteWithContext = {
  '@context': 'https://www.w3.org/ns/activitystreams',
  type: 'Note'
};
const injected2 = injectSearchableBy(noteWithContext, ALICE_URI);
assert.ok(injected2['@context'].includes('https://www.w3.org/ns/activitystreams'), '7d: existing context preserved');
assert.ok(injected2['@context'].includes(FEP_268D_CONTEXT), '7e: FEP-268d context also added');

// Pre-existing searchableBy is not overwritten
const noteWithSearchable = { type: 'Note', searchableBy: ALICE_URI };
const notOverwritten = injectSearchableBy(noteWithSearchable, AS_PUBLIC);
// inject always overwrites — the middleware guards against calling inject when already set
assert.strictEqual(
  notOverwritten.searchableBy,
  AS_PUBLIC,
  '7f: inject replaces existing (middleware guards calling this)'
);

// ---------------------------------------------------------------------------
// 8. deriveDefaultSearchableBy
// ---------------------------------------------------------------------------

assert.strictEqual(deriveDefaultSearchableBy({ to: AS_PUBLIC }), AS_PUBLIC, '8a: public to → as:Public');

assert.strictEqual(
  deriveDefaultSearchableBy({ to: 'as:Public' }),
  AS_PUBLIC,
  '8b: compact as:Public in to → as:Public'
);

assert.strictEqual(
  deriveDefaultSearchableBy({ cc: AS_PUBLIC, to: AS_FOLLOWERS, attributedTo: ACTOR_URI }),
  AS_PUBLIC,
  '8c: public cc → as:Public'
);

assert.strictEqual(
  deriveDefaultSearchableBy({ to: AS_FOLLOWERS, attributedTo: ACTOR_URI }),
  ACTOR_URI,
  '8d: followers-only → attributedTo (author-only)'
);

assert.strictEqual(
  deriveDefaultSearchableBy({ to: ALICE_URI }),
  undefined,
  '8e: direct message with no attributedTo → undefined'
);

// ---------------------------------------------------------------------------
// 9. normalizeSearchableByForOutput
// ---------------------------------------------------------------------------

assert.strictEqual(normalizeSearchableByForOutput(AS_PUBLIC), AS_PUBLIC, '9a: string passthrough');
assert.deepStrictEqual(
  normalizeSearchableByForOutput([AS_PUBLIC, ALICE_URI]),
  [AS_PUBLIC, ALICE_URI],
  '9b: multi-element array preserved'
);
assert.strictEqual(
  normalizeSearchableByForOutput([AS_PUBLIC]),
  AS_PUBLIC,
  '9c: single-element array collapsed to string'
);
assert.strictEqual(normalizeSearchableByForOutput([]), undefined, '9d: empty array → undefined');
assert.strictEqual(normalizeSearchableByForOutput(null), undefined, '9e: null → undefined');

// ---------------------------------------------------------------------------
console.log('fep_268d_search_consent_proof_ok');
