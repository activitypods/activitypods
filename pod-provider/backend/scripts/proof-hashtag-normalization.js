const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeHashtag, extractHashtagsFromText, normalizeActivityPubObjectHashtags } = require('../utils/hashtags');

const conformancePath = path.resolve(
  __dirname,
  '../../../../mastopod-federation-architecture/shared/hashtag-conformance-matrix.json'
);
const conformance = JSON.parse(fs.readFileSync(conformancePath, 'utf8'));

for (const testCase of conformance.extractFromText) {
  const tags = extractHashtagsFromText(testCase.input);
  assert.deepStrictEqual(tags, testCase.expected, `text extraction mismatch for: ${testCase.input}`);
}

for (const testCase of conformance.normalizeStrict) {
  assert.strictEqual(normalizeHashtag(testCase.input), testCase.expected, `strict normalize mismatch: ${testCase.input}`);
}

for (const testCase of conformance.normalizeAllowMissingHash) {
  assert.strictEqual(
    normalizeHashtag(testCase.input, { allowMissingHash: true }),
    testCase.expected,
    `allowMissingHash normalize mismatch: ${testCase.input}`
  );
}

const normalized = normalizeActivityPubObjectHashtags({
  type: 'Note',
  content: 'Hello #World and #fediverse and ＃ぼっち・ざ・ろっく',
  tag: [{ type: 'Mention', href: 'https://remote.example/u/alice' }]
});

assert.ok(Array.isArray(normalized.tag), 'normalized.tag should be an array');
assert.ok(
  normalized.tag.some(t => t.type === 'Mention'),
  'should preserve mention tags'
);
assert.ok(
  normalized.tag.some(t => t.type === 'Hashtag' && t.name === '#world'),
  'should include #world hashtag'
);
assert.ok(
  normalized.tag.some(t => t.type === 'Hashtag' && t.name === '#fediverse'),
  'should include #fediverse hashtag'
);
assert.ok(
  normalized.tag.some(t => t.type === 'Hashtag' && t.name === '#ぼっち・ざ・ろっく'),
  'should include #ぼっち・ざ・ろっく hashtag'
);

console.log('hashtag_normalization_proof_ok');
