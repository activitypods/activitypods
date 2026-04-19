const fs = require('fs');
const path = require('path');
const { normalizeHashtag, extractHashtagsFromText, extractHashtagsFromActivityPubTags } = require('../utils/hashtags');

const conformancePath = path.resolve(
  __dirname,
  '../../../../mastopod-federation-architecture/shared/hashtag-conformance-matrix.json'
);

const conformance = JSON.parse(fs.readFileSync(conformancePath, 'utf8'));

describe('Shared hashtag conformance matrix', () => {
  test('normalizes strict hashtag input per shared matrix', () => {
    for (const testCase of conformance.normalizeStrict) {
      expect(normalizeHashtag(testCase.input)).toBe(testCase.expected);
    }
  });

  test('normalizes allowMissingHash input per shared matrix', () => {
    for (const testCase of conformance.normalizeAllowMissingHash) {
      expect(normalizeHashtag(testCase.input, { allowMissingHash: true })).toBe(testCase.expected);
    }
  });

  test('extracts hashtags from text per shared matrix', () => {
    for (const testCase of conformance.extractFromText) {
      expect(extractHashtagsFromText(testCase.input)).toEqual(testCase.expected);
    }
  });

  test('extracts ActivityPub hashtag tags per shared matrix', () => {
    for (const testCase of conformance.extractFromActivityPubTags) {
      expect(extractHashtagsFromActivityPubTags(testCase.input)).toEqual(testCase.expected);
    }
  });
});
