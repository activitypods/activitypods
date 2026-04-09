'use strict';

const assert = require('assert');
const {
  sanitizeWarningText,
  deriveCanonicalWarningAndSensitive,
  normalizeObjectContentWarning,
  normalizeActivityContentWarning,
} = require('./utils/content-warning');

let passed = 0;
const ok = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  [ok] ${name}`);
  } catch (e) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${e.message}`);
    process.exit(1);
  }
};

console.log('\n§ 1 sanitizeWarningText');
ok('strips html to plain text', () => {
  assert.equal(sanitizeWarningText('<b>Violence</b> warning'), 'Violence warning');
});
ok('empty after sanitize returns undefined', () => {
  assert.equal(sanitizeWarningText('<p>   </p>'), undefined);
});

console.log('\n§ 2 deriveCanonicalWarningAndSensitive');
ok('Mastodon aliases map to canonical', () => {
  const { summary, sensitive } = deriveCanonicalWarningAndSensitive({ spoiler_text: 'CW: spiders', nsfw: true });
  assert.equal(summary, 'CW: spiders');
  assert.equal(sensitive, true);
});
ok('summary alone does not force sensitive', () => {
  const { summary, sensitive } = deriveCanonicalWarningAndSensitive({ summary: 'Abstract of article' });
  assert.equal(summary, 'Abstract of article');
  assert.equal(sensitive, undefined);
});

console.log('\n§ 3 normalizeObjectContentWarning - Note');
ok('normalizes Note spoiler_text -> summary + sensitive', () => {
  const input = {
    type: 'Note',
    content: '<p>Hello</p>',
    spoiler_text: 'CW: flashing lights',
    nsfw: true,
  };
  const out = normalizeObjectContentWarning(input);
  assert.equal(out.type, 'Note');
  assert.equal(out.summary, 'CW: flashing lights');
  assert.equal(out.sensitive, true);
  assert.equal(out.spoiler_text, undefined);
  assert.equal(out.nsfw, undefined);
});
ok('preserves explicit sensitive=false', () => {
  const out = normalizeObjectContentWarning({
    type: 'Note',
    content: '<p>Hello</p>',
    spoiler_text: 'CW: loud sound',
    sensitive: false,
  });
  assert.equal(out.sensitive, false);
  assert.equal(out.summary, 'CW: loud sound');
});

console.log('\n§ 4 normalizeObjectContentWarning - Article/Page');
ok('normalizes Article contentWarning alias', () => {
  const out = normalizeObjectContentWarning({
    type: 'Article',
    content: '<p>Long text</p>',
    contentWarning: 'CW: gore',
  });
  assert.equal(out.summary, 'CW: gore');
  assert.equal(out.sensitive, true);
});
ok('keeps Page summary as summary without inferring sensitive', () => {
  const out = normalizeObjectContentWarning({
    type: 'Page',
    name: 'Post title',
    summary: 'This is a normal abstract.',
  });
  assert.equal(out.summary, 'This is a normal abstract.');
  assert.equal(out.sensitive, undefined);
});
ok('supports incoming Article with nsfw boolean', () => {
  const out = normalizeObjectContentWarning({
    type: 'Article',
    content: '<p>Body</p>',
    summary: 'CW: self-harm',
    nsfw: true,
  });
  assert.equal(out.summary, 'CW: self-harm');
  assert.equal(out.sensitive, true);
  assert.equal(out.nsfw, undefined);
});

console.log('\n§ 5 normalizeActivityContentWarning');
ok('normalizes Create/Note object', () => {
  const input = {
    type: 'Create',
    object: {
      type: 'Note',
      content: '<p>text</p>',
      spoilerText: 'CW: spoilers',
    },
  };
  const out = normalizeActivityContentWarning(input);
  assert.equal(out.object.summary, 'CW: spoilers');
  assert.equal(out.object.sensitive, true);
  assert.equal(out.object.spoilerText, undefined);
});
ok('normalizes Update/Article object', () => {
  const input = {
    type: 'Update',
    object: {
      type: 'Article',
      content: '<p>updated body</p>',
      content_warning: 'CW: political violence',
    },
  };
  const out = normalizeActivityContentWarning(input);
  assert.equal(out.object.summary, 'CW: political violence');
  assert.equal(out.object.sensitive, true);
});
ok('ignores unsupported object type', () => {
  const input = { type: 'Create', object: { type: 'Person', summary: 'bio' } };
  const out = normalizeActivityContentWarning(input);
  assert.strictEqual(out, input);
});

console.log(`\ncontent_warning_sensitive_proof_ok (${passed} assertions)`);
