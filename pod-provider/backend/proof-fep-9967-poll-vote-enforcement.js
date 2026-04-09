'use strict';

const assert = require('assert');
const pollService = require('./services/polls-manager.service');

let passed = 0;
let failed = 0;

const ok = async (label, fn) => {
  try {
    await fn();
    console.log(`  [ok] ${label}`);
    passed++;
  } catch (error) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${error.message}`);
    failed++;
  }
};

const createServiceHarness = (options = {}) => {
  const calls = [];
  const allowedCollectionMemberships = new Set(options.allowedCollectionMemberships || []);
  const service = {
    pollStateById: new Map(),
    logger: {
      warn: () => {},
    },
    ...pollService.methods,
  };

  const ctx = {
    call: async (action, params) => {
      calls.push({ action, params });
      if (action === 'activitypub.actor.get') {
        return { outbox: 'https://social.example/actors/alice/outbox' };
      }
      if (action === 'activitypub.collection.includes') {
        const key = `${params.collectionUri}|${params.itemUri}`;
        return allowedCollectionMemberships.has(key);
      }
      if (action === 'activitypub.outbox.post') {
        return { success: true };
      }
      throw new Error(`unexpected action ${action}`);
    },
  };

  return { service, ctx, calls };
};

(async () => {
  console.log('\n§ 1  register poll and enforce single-choice semantics');
  await ok('accepts first vote and rejects second single-choice vote from same actor', async () => {
    const { service, ctx, calls } = createServiceHarness();

    await service.registerPollFromActivity(ctx, {
      type: 'Create',
      actor: 'https://social.example/actors/alice',
      object: {
        id: 'https://social.example/polls/1',
        type: 'Question',
        attributedTo: 'https://social.example/actors/alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        oneOf: ['A', 'B'],
      },
    });

    const first = await pollService.actions.commitInboundVote.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          object: {
            id: 'https://social.example/votes/1',
            type: 'Note',
            attributedTo: 'https://social.example/actors/bob',
            inReplyTo: 'https://social.example/polls/1',
            name: 'A',
          },
        },
        voterActorUri: 'https://social.example/actors/bob',
      },
      call: ctx.call,
    });

    const second = await pollService.actions.precheckInboundVote.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          object: {
            id: 'https://social.example/votes/2',
            type: 'Note',
            attributedTo: 'https://social.example/actors/bob',
            inReplyTo: 'https://social.example/polls/1',
            name: 'B',
          },
        },
        voterActorUri: 'https://social.example/actors/bob',
      },
    });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.reason, 'single_choice_already_voted');
    assert.equal(calls.some(entry => entry.action === 'activitypub.outbox.post'), true);
  });

  console.log('\n§ 2  permission and duplicate checks');
  await ok('rejects non-public poll vote by actor outside audience', async () => {
    const { service, ctx } = createServiceHarness();

    await service.registerPollFromActivity(ctx, {
      type: 'Create',
      actor: 'https://social.example/actors/alice',
      object: {
        id: 'https://social.example/polls/2',
        type: 'Question',
        attributedTo: 'https://social.example/actors/alice',
        to: ['https://social.example/actors/charlie'],
        oneOf: ['A', 'B'],
      },
    });

    const precheck = await pollService.actions.precheckInboundVote.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          object: {
            id: 'https://social.example/votes/3',
            type: 'Note',
            attributedTo: 'https://social.example/actors/bob',
            inReplyTo: 'https://social.example/polls/2',
            name: 'A',
          },
        },
        voterActorUri: 'https://social.example/actors/bob',
      },
    });

    assert.equal(precheck.accepted, false);
    assert.equal(precheck.reason, 'permission_denied');
  });

  await ok('accepts non-public poll vote when actor is in followers collection', async () => {
    const { service, ctx } = createServiceHarness({
      allowedCollectionMemberships: [
        'https://social.example/actors/alice/followers|https://social.example/actors/bob',
      ],
    });

    await service.registerPollFromActivity(ctx, {
      type: 'Create',
      actor: 'https://social.example/actors/alice',
      object: {
        id: 'https://social.example/polls/2b',
        type: 'Question',
        attributedTo: 'https://social.example/actors/alice',
        to: ['https://social.example/actors/alice/followers'],
        oneOf: ['A', 'B'],
      },
    });

    const precheck = await pollService.actions.precheckInboundVote.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          object: {
            id: 'https://social.example/votes/3b',
            type: 'Note',
            attributedTo: 'https://social.example/actors/bob',
            inReplyTo: 'https://social.example/polls/2b',
            name: 'A',
          },
        },
        voterActorUri: 'https://social.example/actors/bob',
      },
      call: ctx.call,
    });

    assert.equal(precheck.accepted, true);
  });

  await ok('rejects duplicate vote id', async () => {
    const { service, ctx } = createServiceHarness();

    await service.registerPollFromActivity(ctx, {
      type: 'Create',
      actor: 'https://social.example/actors/alice',
      object: {
        id: 'https://social.example/polls/3',
        type: 'Question',
        attributedTo: 'https://social.example/actors/alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        anyOf: ['A', 'B'],
      },
    });

    const voteActivity = {
      type: 'Create',
      object: {
        id: 'https://social.example/votes/4',
        type: 'Note',
        attributedTo: 'https://social.example/actors/bob',
        inReplyTo: 'https://social.example/polls/3',
        name: 'A',
      },
    };

    const first = await pollService.actions.commitInboundVote.handler.call(service, {
      params: { activity: voteActivity, voterActorUri: 'https://social.example/actors/bob' },
      call: ctx.call,
    });

    const second = await pollService.actions.precheckInboundVote.handler.call(service, {
      params: { activity: voteActivity, voterActorUri: 'https://social.example/actors/bob' },
    });

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.reason, 'duplicate_vote_id');
  });

  console.log('\n§ 3  reset counts when options or mode changes');
  await ok('resets vote state when mode/options change on poll update', async () => {
    const { service, ctx } = createServiceHarness();

    await service.registerPollFromActivity(ctx, {
      type: 'Create',
      actor: 'https://social.example/actors/alice',
      object: {
        id: 'https://social.example/polls/4',
        type: 'Question',
        attributedTo: 'https://social.example/actors/alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        oneOf: ['A', 'B'],
      },
    });

    await pollService.actions.commitInboundVote.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          object: {
            id: 'https://social.example/votes/5',
            type: 'Note',
            attributedTo: 'https://social.example/actors/bob',
            inReplyTo: 'https://social.example/polls/4',
            name: 'A',
          },
        },
        voterActorUri: 'https://social.example/actors/bob',
      },
      call: ctx.call,
    });

    const before = service.pollStateById.get('https://social.example/polls/4');
    assert.equal(before.options.find(o => o.name === 'A').totalItems, 1);

    const updated = await service.registerPollFromActivity(ctx, {
      type: 'Update',
      actor: 'https://social.example/actors/alice',
      object: {
        id: 'https://social.example/polls/4',
        type: 'Question',
        attributedTo: 'https://social.example/actors/alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        anyOf: ['A', 'B', 'C'],
      },
    });

    const after = service.pollStateById.get('https://social.example/polls/4');
    assert.equal(updated.resetVotes, true);
    assert.equal(after.options.find(o => o.name === 'A').totalItems, 0);
    assert.equal(after.voteIds.size, 0);
  });

  if (failed > 0) {
    console.error(`\nproof_fep_9967_poll_vote_enforcement_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nfep_9967_poll_vote_enforcement_proof_ok (${passed} assertions)`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
