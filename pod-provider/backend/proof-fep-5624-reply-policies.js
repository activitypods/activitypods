'use strict';

const assert = require('assert');
const CONFIG = require('./config/config');
const replyPolicies = require('./services/reply-policies.service');
const ReplyPoliciesMiddleware = require('./middlewares/reply-policies');
const {
  AS_PUBLIC,
  extractCanReplyState,
  getReplyApprovalUri,
  isValidApproveReply,
  normalizeReplyDecisionActivity,
  normalizeReplyPolicyActivity,
} = require('./utils/reply-policies');

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

const createHarness = (options = {}) => {
  const resources = new Map(Object.entries(options.resources || {}));
  const actors = new Map(Object.entries(options.actors || {}));
  const collectionMemberships = new Set(options.collectionMemberships || []);
  const calls = [];

  const service = {
    ...replyPolicies.methods,
    logger: { debug: () => {} },
  };

  const ctx = {
    call: async (action, params) => {
      calls.push({ action, params });
      if (action === 'ldp.remote.store') return true;
      if (action === 'ldp.resource.get') return resources.get(params.resourceUri) || null;
      if (action === 'activitypub.actor.get') return actors.get(params.actorUri) || null;
      if (action === 'activitypub.collection.includes') {
        return collectionMemberships.has(`${params.collectionUri}|${params.itemUri}`);
      }
      if (action === 'activitypub.outbox.post') {
        return { id: `https://pod.example/activities/${calls.length}` };
      }
      if (action === 'reply-policies.resolveOutboundReplyPolicy') {
        return replyPolicies.actions.resolveOutboundReplyPolicy.handler.call(service, {
          params,
          call: ctx.call,
        });
      }
      throw new Error(`unexpected action ${action}`);
    },
  };

  return { service, ctx, calls };
};

(async () => {
  const localBaseUrl = CONFIG.BASE_URL.replace(/\/$/, '');

  console.log('\n§ 1  normalization');

  await ok('normalizes canReply and injects mentioned actors', () => {
    const note = normalizeReplyPolicyActivity({
      type: 'Note',
      content: 'hello',
      canReply: ['as:Public'],
      tag: { type: 'Mention', href: 'https://social.example/users/bob', name: 'bob' },
    });

    const state = extractCanReplyState(note);
    assert.deepStrictEqual(state.values, [AS_PUBLIC, 'https://social.example/users/bob']);
    assert.ok(Array.isArray(note['@context']));
  });

  await ok('preserves empty canReply arrays', () => {
    const note = normalizeReplyPolicyActivity({ type: 'Note', content: 'closed', canReply: [] });
    assert.deepStrictEqual(note.canReply, []);
  });

  await ok('normalizes replyApproval to a plain IRI and injects context', () => {
    const note = normalizeReplyPolicyActivity({
      type: 'Note',
      content: 'reply',
      inReplyTo: 'https://social.example/notes/1',
      replyApproval: { id: 'https://social.example/approvals/1' },
    });
    assert.equal(getReplyApprovalUri(note), 'https://social.example/approvals/1');
    assert.ok(Array.isArray(note['@context']));
  });

  await ok('normalizes ApproveReply object and inReplyTo to plain URIs', () => {
    const activity = normalizeReplyDecisionActivity({
      type: 'ApproveReply',
      actor: 'https://pod.example/users/alice',
      object: { id: 'https://remote.example/notes/reply-1' },
      inReplyTo: { id: 'https://pod.example/notes/1' },
    });
    assert.equal(activity.object, 'https://remote.example/notes/reply-1');
    assert.equal(activity.inReplyTo, 'https://pod.example/notes/1');
  });

  await ok('validates ApproveReply structure for third-party checks', () => {
    assert.equal(
      isValidApproveReply(
        {
          type: 'ApproveReply',
          actor: 'https://remote.example/users/alice',
          object: 'https://remote.example/users/bob/replies/1',
          inReplyTo: 'https://remote.example/notes/parent',
        },
        {
          authorityUri: 'https://remote.example/users/alice',
          replyObjectUri: 'https://remote.example/users/bob/replies/1',
          inReplyTo: 'https://remote.example/notes/parent',
        },
      ),
      true,
    );
  });

  console.log('\n§ 2  service precheck');

  await ok('accepts local reply when actor is in canReply followers collection', async () => {
    const { service, ctx } = createHarness({
      resources: {
        [`${localBaseUrl}/notes/1`]: {
          id: `${localBaseUrl}/notes/1`,
          type: 'Note',
          attributedTo: `${localBaseUrl}/users/alice`,
          canReply: [`${localBaseUrl}/users/alice/followers`],
        },
      },
      collectionMemberships: [`${localBaseUrl}/users/alice/followers|https://remote.example/users/bob`],
    });

    const result = await replyPolicies.actions.precheckInboundReply.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          actor: 'https://remote.example/users/bob',
          object: {
            id: 'https://remote.example/replies/1',
            type: 'Note',
            inReplyTo: `${localBaseUrl}/notes/1`,
            content: 'hello',
          },
        },
      },
      call: ctx.call,
    });

    assert.equal(result.accepted, true);
    assert.equal(result.requiresApproval, true);
    assert.equal(result.reason, 'collection_member');
  });

  await ok('rejects local reply when replies are disabled', async () => {
    const { service, ctx } = createHarness({
      resources: {
        [`${localBaseUrl}/notes/2`]: {
          id: `${localBaseUrl}/notes/2`,
          type: 'Note',
          attributedTo: `${localBaseUrl}/users/alice`,
          canReply: [],
        },
      },
    });

    const result = await replyPolicies.actions.precheckInboundReply.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          actor: 'https://remote.example/users/bob',
          object: {
            id: 'https://remote.example/replies/2',
            type: 'Note',
            inReplyTo: `${localBaseUrl}/notes/2`,
            content: 'nope',
          },
        },
      },
      call: ctx.call,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'replies_disabled');
  });

  await ok('accepts third-party reply to remote authority only when valid replyApproval exists', async () => {
    const { service, ctx } = createHarness({
      resources: {
        'https://remote.example/notes/1': {
          id: 'https://remote.example/notes/1',
          type: 'Note',
          attributedTo: 'https://remote.example/users/alice',
          canReply: ['https://remote.example/users/alice/followers'],
        },
        'https://remote.example/approvals/1': {
          id: 'https://remote.example/approvals/1',
          type: 'ApproveReply',
          actor: 'https://remote.example/users/alice',
          object: 'https://remote.example/users/bob/replies/3',
          inReplyTo: 'https://remote.example/notes/1',
        },
      },
    });

    const result = await replyPolicies.actions.precheckInboundReply.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          actor: 'https://remote.example/users/bob',
          object: {
            id: 'https://remote.example/users/bob/replies/3',
            type: 'Note',
            inReplyTo: 'https://remote.example/notes/1',
            replyApproval: 'https://remote.example/approvals/1',
            content: 'approved',
          },
        },
      },
      call: ctx.call,
    });

    assert.equal(result.accepted, true);
    assert.equal(result.requiresApproval, false);
    assert.equal(result.reason, 'valid_reply_approval');
  });

  await ok('rejects third-party remote reply without replyApproval', async () => {
    const { service, ctx } = createHarness({
      resources: {
        'https://remote.example/notes/4': {
          id: 'https://remote.example/notes/4',
          type: 'Note',
          attributedTo: 'https://remote.example/users/alice',
          canReply: ['https://remote.example/users/alice/followers'],
        },
      },
    });

    const result = await replyPolicies.actions.precheckInboundReply.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          actor: 'https://remote.example/users/bob',
          object: {
            id: 'https://remote.example/users/bob/replies/4',
            type: 'Note',
            inReplyTo: 'https://remote.example/notes/4',
            content: 'missing approval',
          },
        },
      },
      call: ctx.call,
    });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'missing_reply_approval');
  });

  console.log('\n§ 3  approval and rejection emission');

  await ok('resolves outbound reply policy with human-readable label', async () => {
    const { service, ctx } = createHarness({
      resources: {
        'https://remote.example/notes/policy-1': {
          id: 'https://remote.example/notes/policy-1',
          type: 'Note',
          attributedTo: 'https://remote.example/users/alice',
          canReply: ['https://remote.example/users/alice/followers'],
        },
      },
      collectionMemberships: ['https://remote.example/users/alice/followers|https://remote.example/users/bob'],
    });

    const result = await replyPolicies.actions.resolveOutboundReplyPolicy.handler.call(service, {
      params: {
        objectUri: 'https://remote.example/notes/policy-1',
        replierActorUri: 'https://remote.example/users/bob',
        webId: 'https://remote.example/users/bob',
      },
      call: ctx.call,
    });

    assert.equal(result.mayReply, true);
    assert.equal(result.requiresApproval, true);
    assert.equal(result.policyLabel, 'Only followers can reply');
  });

  await ok('submits protected outbound replies as pending approval', async () => {
    const { service, ctx, calls } = createHarness({
      resources: {
        'https://remote.example/notes/policy-2': {
          id: 'https://remote.example/notes/policy-2',
          type: 'Note',
          attributedTo: 'https://remote.example/users/alice',
          canReply: ['https://remote.example/users/alice/followers'],
        },
      },
      actors: {
        'https://remote.example/users/bob': {
          id: 'https://remote.example/users/bob',
          outbox: 'https://remote.example/users/bob/outbox',
        },
      },
      collectionMemberships: ['https://remote.example/users/alice/followers|https://remote.example/users/bob'],
    });

    const result = await replyPolicies.actions.submitReply.handler.call(service, {
      params: {
        objectUri: 'https://remote.example/notes/policy-2',
        content: 'pending reply',
        isPublic: true,
        replierActorUri: 'https://remote.example/users/bob',
        webId: 'https://remote.example/users/bob',
      },
      call: ctx.call,
    });

    const outboxCall = calls.find(call => call.action === 'activitypub.outbox.post');
    assert(outboxCall);
    assert.equal(outboxCall.params.to, 'https://remote.example/users/alice');
    assert.equal(outboxCall.params.inReplyTo, 'https://remote.example/notes/policy-2');
    assert.equal(result.pendingApproval, true);
  });

  await ok('emits ApproveReply from authority outbox', async () => {
    const { service, ctx, calls } = createHarness({
      resources: {
        [`${localBaseUrl}/notes/1`]: {
          id: `${localBaseUrl}/notes/1`,
          type: 'Note',
          attributedTo: `${localBaseUrl}/users/alice`,
          to: [`${localBaseUrl}/users/alice/followers`],
          cc: ['https://www.w3.org/ns/activitystreams#Public'],
        },
      },
      actors: {
        [`${localBaseUrl}/users/alice`]: {
          id: `${localBaseUrl}/users/alice`,
          outbox: `${localBaseUrl}/users/alice/outbox`,
        },
      },
    });

    await replyPolicies.actions.approveReply.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          actor: 'https://remote.example/users/bob',
          object: {
            id: 'https://remote.example/replies/5',
            type: 'Note',
            inReplyTo: 'https://pod.example/notes/1',
          },
        },
        authorityUri: `${localBaseUrl}/users/alice`,
        parentObjectUri: `${localBaseUrl}/notes/1`,
        replyActorUri: 'https://remote.example/users/bob',
      },
      call: ctx.call,
    });

    const outboxCall = calls.find(call => call.action === 'activitypub.outbox.post');
    assert(outboxCall);
    assert.equal(outboxCall.params.type, 'ApproveReply');
    assert.equal(outboxCall.params.object, 'https://remote.example/replies/5');
    assert.equal(outboxCall.params.inReplyTo, `${localBaseUrl}/notes/1`);
  });

  await ok('emits RejectReply from authority outbox', async () => {
    const { service, ctx, calls } = createHarness({
      actors: {
        [`${localBaseUrl}/users/alice`]: {
          id: `${localBaseUrl}/users/alice`,
          outbox: `${localBaseUrl}/users/alice/outbox`,
        },
      },
    });

    await replyPolicies.actions.rejectReply.handler.call(service, {
      params: {
        activity: {
          type: 'Create',
          actor: 'https://remote.example/users/bob',
          object: {
            id: 'https://remote.example/replies/6',
            type: 'Note',
            inReplyTo: `${localBaseUrl}/notes/6`,
          },
        },
        authorityUri: `${localBaseUrl}/users/alice`,
        replyActorUri: 'https://remote.example/users/bob',
      },
      call: ctx.call,
    });

    const outboxCall = calls.find(call => call.action === 'activitypub.outbox.post');
    assert(outboxCall);
    assert.equal(outboxCall.params.type, 'RejectReply');
    assert.equal(outboxCall.params.object, 'https://remote.example/replies/6');
  });

  console.log('\n§ 4  middleware integration');

  await ok('middleware short-circuits rejected replies and sends RejectReply', async () => {
    const mw = ReplyPoliciesMiddleware();
    const outboundCalls = [];
    const handler = mw.localAction(async () => {
      throw new Error('next should not be called');
    }, { name: 'activitypub.inbox.post' });

    await handler({
      params: {
        type: 'Create',
        actor: 'https://remote.example/users/bob',
        object: {
          id: 'https://remote.example/replies/7',
          type: 'Note',
          inReplyTo: 'https://pod.example/notes/7',
        },
      },
      meta: { webId: 'https://remote.example/users/bob' },
      call: async (action, params) => {
        outboundCalls.push({ action, params });
        if (action === 'reply-policies.precheckInboundReply') {
          return {
            accepted: false,
            authorityLocal: true,
            authorityUri: 'https://pod.example/users/alice',
            parentObjectUri: 'https://pod.example/notes/7',
            replyActorUri: 'https://remote.example/users/bob',
          };
        }
        if (action === 'reply-policies.rejectReply') return { id: 'reject-1' };
        throw new Error(`unexpected action ${action}`);
      },
    });

    assert.ok(outboundCalls.find(call => call.action === 'reply-policies.rejectReply'));
  });

  await ok('middleware approves accepted local replies after inbox storage', async () => {
    const mw = ReplyPoliciesMiddleware();
    const calls = [];
    const handler = mw.localAction(async () => 'stored', { name: 'activitypub.inbox.post' });

    const result = await handler({
      params: {
        type: 'Create',
        actor: 'https://remote.example/users/bob',
        object: {
          id: 'https://remote.example/replies/8',
          type: 'Note',
          inReplyTo: 'https://pod.example/notes/8',
          content: 'approved later',
        },
      },
      meta: { webId: 'https://remote.example/users/bob' },
      call: async (action, params) => {
        calls.push({ action, params });
        if (action === 'reply-policies.precheckInboundReply') {
          return {
            accepted: true,
            requiresApproval: true,
            authorityUri: 'https://pod.example/users/alice',
            parentObjectUri: 'https://pod.example/notes/8',
            replyActorUri: 'https://remote.example/users/bob',
          };
        }
        if (action === 'reply-policies.approveReply') return { id: 'approve-1' };
        throw new Error(`unexpected action ${action}`);
      },
    });

    assert.equal(result, 'stored');
    assert.ok(calls.find(call => call.action === 'reply-policies.approveReply'));
  });

  if (failed > 0) {
    console.error(`\nproof_fep_5624_reply_policies_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nfep_5624_reply_policies_proof_ok (${passed} assertions)`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});