'use strict';
/**
 * Proof script: FEP-9967 Polls normalization (AP-side)
 *
 * Run from pod-provider/backend:
 *   node proof-fep-9967-polls.js
 */

const assert = require('assert');
const { isVoteNote, normalizePollObject, normalizePollActivity } = require('./utils/polls');
const PollsMiddleware = require('./middlewares/polls');

let passed = 0;
let failed = 0;

const ok = (label, fn) => {
  try {
    fn();
    console.log(`  [ok] ${label}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${e.message}`);
    failed++;
  }
};

console.log('\n§ 1  Question normalization');

ok('normalizes oneOf options to Note + replies Collection', () => {
  const object = {
    type: 'Question',
    content: '<p>Question?</p>',
    oneOf: [
      { name: 'Yes', replies: { totalItems: 2 } },
      { name: 'No', replies: { totalItems: '3' } }
    ]
  };
  const normalized = normalizePollObject(object);
  assert.equal(normalized.type, 'Question');
  assert.equal(Array.isArray(normalized.oneOf), true);
  assert.equal(normalized.oneOf.length, 2);
  assert.deepStrictEqual(normalized.oneOf[0], {
    type: 'Note',
    name: 'Yes',
    replies: { type: 'Collection', totalItems: 2 }
  });
  assert.deepStrictEqual(normalized.oneOf[1], {
    type: 'Note',
    name: 'No',
    replies: { type: 'Collection', totalItems: 3 }
  });
});

ok('deduplicates duplicate option names', () => {
  const object = {
    type: 'Question',
    oneOf: [{ name: 'A' }, { name: 'A' }, { name: 'B' }]
  };
  const normalized = normalizePollObject(object);
  assert.equal(normalized.oneOf.length, 2);
  assert.equal(normalized.oneOf[0].name, 'A');
  assert.equal(normalized.oneOf[1].name, 'B');
});

ok('normalizes anyOf mode and date aliases endTime/closed', () => {
  const object = {
    type: 'Question',
    anyOf: [{ name: 'A' }],
    closed: '2026-04-03T11:00:00Z'
  };
  const normalized = normalizePollObject(object);
  assert.equal(Array.isArray(normalized.anyOf), true);
  assert.equal(normalized.endTime, '2026-04-03T11:00:00.000Z');
  assert.equal(normalized.closed, '2026-04-03T11:00:00.000Z');
});

ok('ignores invalid Question with no valid options', () => {
  const object = { type: 'Question', oneOf: [{ foo: 'bar' }] };
  const normalized = normalizePollObject(object);
  assert.strictEqual(normalized, object);
});

console.log('\n§ 2  Vote Note normalization');

ok('detects vote Note by name + inReplyTo + no content requirement', () => {
  const vote = {
    type: 'Note',
    attributedTo: 'https://social.example/actors/2',
    inReplyTo: 'https://social.example/polls/1',
    name: 'Answer 1'
  };
  assert.equal(isVoteNote(vote), true);
});

ok('normalizes vote aliases and strips content', () => {
  const vote = {
    type: 'Note',
    inReplyTo: ' https://social.example/polls/1 ',
    option: ' Answer 1 ',
    content: '<p>should not be present</p>'
  };
  const normalized = normalizePollObject(vote);
  assert.equal(normalized.name, 'Answer 1');
  assert.equal(normalized.inReplyTo, 'https://social.example/polls/1');
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'content'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'option'), false);
});

console.log('\n§ 3  Activity wrappers');

ok('normalizes wrapped Create Question object', () => {
  const activity = {
    type: 'Create',
    object: {
      type: 'Question',
      oneOf: ['A', 'B']
    }
  };
  const normalized = normalizePollActivity(activity);
  assert.equal(normalized.object.oneOf.length, 2);
  assert.equal(normalized.object.oneOf[0].name, 'A');
});

ok('ensures updated is present on Update Question object', () => {
  const activity = {
    type: 'Update',
    object: {
      type: 'Question',
      oneOf: ['A', 'B']
    }
  };
  const normalized = normalizePollActivity(activity, {
    now: () => new Date('2026-04-03T12:00:00.000Z')
  });
  assert.equal(normalized.object.updated, '2026-04-03T12:00:00.000Z');
});

console.log('\n§ 4  PollsMiddleware integration');

ok('middleware passes through unrelated action names', async () => {
  const middleware = PollsMiddleware();
  const next = async ctx => ctx;
  const action = { name: 'something.else' };
  const wrapped = middleware.localAction(next, action);
  assert.strictEqual(wrapped, next);
});

ok('middleware normalizes outbox Question payload', async () => {
  const middleware = PollsMiddleware();
  const action = { name: 'activitypub.outbox.post' };
  const next = async ctx => ctx.params;
  const wrapped = middleware.localAction(next, action);

  const output = await wrapped({
    params: {
      collectionUri: 'https://social.example/users/alice/outbox',
      type: 'Create',
      object: {
        type: 'Question',
        oneOf: ['A', 'B']
      }
    },
    call: async () => ({ accepted: true })
  });

  assert.equal(output.object.oneOf.length, 2);
  assert.equal(output.object.oneOf[1].name, 'B');
});

ok('middleware normalizes inbox vote payload', async () => {
  const middleware = PollsMiddleware();
  const action = { name: 'activitypub.inbox.post' };
  const next = async ctx => ctx.params;
  const wrapped = middleware.localAction(next, action);

  const output = await wrapped({
    params: {
      type: 'Create',
      object: {
        type: 'Note',
        inReplyTo: 'https://social.example/polls/1',
        choice: 'Answer 1',
        content: 'invalid for votes'
      }
    },
    call: async () => ({ accepted: true })
  });

  assert.equal(output.object.name, 'Answer 1');
  assert.equal(Object.prototype.hasOwnProperty.call(output.object, 'content'), false);
});

Promise.resolve()
  .then(() => {
    if (failed > 0) {
      console.error(`\nproof_fep_9967_polls_failed (${failed} failed, ${passed} passed)`);
      process.exit(1);
    }
    console.log(`\nfep_9967_polls_proof_ok (${passed} assertions)`);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
