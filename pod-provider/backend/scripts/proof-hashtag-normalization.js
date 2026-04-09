const assert = require('assert');
const {
  normalizeHashtag,
  extractHashtagsFromText,
  normalizeActivityPubObjectHashtags,
} = require('../utils/hashtags');

const examples = [
  '#hashtag',
  '"#hashtag"',
  ' #hashtag',
  '( #hashtag / #hashtag)',
  '-#hashtag',
  '_#hashtag',
  '!#hashtag',
  '?#hashtag',
  '@#hashtag',
  ';#hashtag',
  ',#hashtag',
  ".'#hashtag",
  '[#hashtag',
  '&#hashtag',
  '^#hashtag',
];

for (const sample of examples) {
  const tags = extractHashtagsFromText(sample);
  assert.deepStrictEqual(tags, ['hashtag'], `expected one hashtag from: ${sample}`);
}

assert.strictEqual(normalizeHashtag('#Hash_Tag2'), 'hash_tag2');
assert.strictEqual(normalizeHashtag('#hash-tag'), null);

const normalized = normalizeActivityPubObjectHashtags({
  type: 'Note',
  content: 'Hello #World and #fediverse',
  tag: [{ type: 'Mention', href: 'https://remote.example/u/alice' }],
});

assert.ok(Array.isArray(normalized.tag), 'normalized.tag should be an array');
assert.ok(normalized.tag.some(t => t.type === 'Mention'), 'should preserve mention tags');
assert.ok(normalized.tag.some(t => t.type === 'Hashtag' && t.name === '#world'), 'should include #world hashtag');
assert.ok(
  normalized.tag.some(t => t.type === 'Hashtag' && t.name === '#fediverse'),
  'should include #fediverse hashtag'
);

console.log('hashtag_normalization_proof_ok');
