'use strict';

const serviceDefinition = require('../services/dashboard/user-settings-api.service');

function createService(publishResult = { ok: true, canonicalIntentId: 'intent-123' }) {
  return {
    settings: {
      auditLogMaxEntries: 500,
      blueskyDefaultLabelerDid: 'did:plc:defaultlabeler123'
    },
    logger: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    },
    _moderationCases: [],
    ...serviceDefinition.methods,
    saveProviderData: jest.fn().mockResolvedValue(undefined),
    publishCanonicalModerationReport: jest.fn().mockResolvedValue(publishResult)
  };
}

function createCtx() {
  return {
    call: jest.fn(async (actionName, params) => {
      if (actionName === 'identitybindings.getByCanonicalAccountId') {
        return {
          canonicalAccountId: params.canonicalAccountId,
          activityPubActorUri: 'https://pod.example/users/alice',
          atprotoDid: 'did:plc:alice123',
          atprotoHandle: 'alice.test',
          atprotoPdsUrl: 'https://pod.example'
        };
      }

      throw new Error(`Unexpected action call: ${actionName}`);
    })
  };
}

function makeReportInput() {
  return {
    subject: {
      kind: 'account',
      actor: {
        activityPubActorUri: 'https://remote.example/users/bob'
      },
      authoritativeProtocol: 'ap'
    },
    reasonType: 'harassment',
    reason: 'Targeted harassment',
    evidenceObjectRefs: [
      {
        canonicalObjectId: 'https://remote.example/notes/1',
        activityPubObjectId: 'https://remote.example/notes/1'
      }
    ],
    requestedForwarding: { remote: true },
    clientContext: {
      app: 'memory',
      surface: 'report-sheet'
    }
  };
}

function makeAtprotoReportInput(overrides = {}) {
  return {
    subject: {
      kind: 'account',
      actor: {
        did: 'did:plc:bob123',
        handle: 'bob.test'
      },
      authoritativeProtocol: 'at'
    },
    reasonType: 'harassment',
    reason: 'Targeted harassment',
    evidenceObjectRefs: [],
    requestedForwarding: { remote: true },
    clientContext: {
      app: 'memory',
      surface: 'report-sheet'
    },
    ...overrides
  };
}

describe('user-settings moderation reports', () => {
  test('stores a local report case and marks canonical publication success', async () => {
    const service = createService();
    const ctx = createCtx();

    const result = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', makeReportInput());

    expect(result.duplicate).toBe(false);
    expect(result.canonicalPublished).toBe(true);
    expect(result.canonicalIntentId).toBe('intent-123');
    expect(result.case).toEqual(
      expect.objectContaining({
        source: 'local-user-report',
        protocol: 'activitypods',
        reasonType: 'harassment',
        reason: 'Targeted harassment',
        subject: {
          kind: 'account',
          actor: expect.objectContaining({
            activityPubActorUri: 'https://remote.example/users/bob'
          }),
          authoritativeProtocol: 'ap'
        },
        reporter: expect.objectContaining({
          webId: 'https://pod.example/alice#me',
          activityPubActorUri: 'https://pod.example/users/alice',
          did: 'did:plc:alice123',
          handle: 'alice.test'
        }),
        canonicalEvent: expect.objectContaining({
          status: 'published',
          canonicalIntentId: 'intent-123'
        })
      })
    );
    expect(service.publishCanonicalModerationReport).toHaveBeenCalledTimes(1);
    expect(service.saveProviderData).toHaveBeenCalled();
  });

  test('deduplicates identical local reports without republishing', async () => {
    const service = createService();
    const ctx = createCtx();
    const input = makeReportInput();

    const first = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', input);
    const second = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.case.id).toBe(first.case.id);
    expect(service.publishCanonicalModerationReport).toHaveBeenCalledTimes(1);
  });

  test('keeps the local case when canonical publication fails', async () => {
    const service = createService({ ok: false, error: 'circuit_open' });
    const ctx = createCtx();

    const result = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', makeReportInput());

    expect(result.duplicate).toBe(false);
    expect(result.canonicalPublished).toBe(false);
    expect(result.case.canonicalEvent).toEqual(
      expect.objectContaining({
        status: 'failed',
        lastError: 'circuit_open'
      })
    );
    expect(service._moderationCases).toHaveLength(1);
  });

  test('preserves and deep-merges ActivityPub forwarding state on case patches', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', makeReportInput());

    let updated = await service.patchStoredModerationCase(created.case.id, {
      forwarding: {
        activityPub: {
          status: 'queued',
          canonicalIntentId: 'c'.repeat(64),
          moderationActorUri: 'https://local.example/users/moderation',
          activityId: 'https://local.example/users/moderation/flags/' + 'c'.repeat(64),
          outboxIntentId: 'moderation-report:' + 'c'.repeat(64),
          targetActorUri: 'https://remote.example/users/bob',
          targetInbox: 'https://remote.example/inbox',
          targetDomain: 'remote.example'
        }
      }
    });

    expect(updated.forwarding.activityPub).toEqual(
      expect.objectContaining({
        status: 'queued',
        canonicalIntentId: 'c'.repeat(64),
        targetInbox: 'https://remote.example/inbox'
      })
    );

    updated = await service.patchStoredModerationCase(created.case.id, {
      forwarding: {
        activityPub: {
          status: 'delivered',
          deliveredAt: '2026-04-22T12:05:00.000Z',
          lastStatusCode: 202
        }
      }
    });

    expect(updated.forwarding.activityPub).toEqual(
      expect.objectContaining({
        status: 'delivered',
        canonicalIntentId: 'c'.repeat(64),
        targetInbox: 'https://remote.example/inbox',
        deliveredAt: '2026-04-22T12:05:00.000Z',
        lastStatusCode: 202
      })
    );
  });

  test('builds a ready ATProto forwarding plan for a managed local reporter', async () => {
    const service = createService();
    const ctx = createCtx();
    service.listByContainer = jest.fn().mockResolvedValue([]);
    service.createManagedAtprotoSession = jest.fn().mockResolvedValue({ accessJwt: 'managed-access-token-1234567890' });

    const created = await service.createLocalModerationReport(
      ctx,
      'https://pod.example/alice#me',
      makeAtprotoReportInput()
    );

    const plan = await service.buildAtprotoModerationForwardingPlan(ctx, created.case, {
      canonicalIntentId: 'intent-at-1'
    });

    expect(plan).toEqual(
      expect.objectContaining({
        status: 'ready',
        serviceDid: 'did:plc:defaultlabeler123',
        pdsUrl: 'https://pod.example',
        reporterDid: 'did:plc:alice123',
        reporterHandle: 'alice.test',
        subjectDid: 'did:plc:bob123',
        accessJwt: 'managed-access-token-1234567890',
        request: expect.objectContaining({
          reasonType: 'com.atproto.moderation.defs#reasonRude',
          reason: 'Targeted harassment',
          subject: { did: 'did:plc:bob123' }
        })
      })
    );
    expect(service.createManagedAtprotoSession).toHaveBeenCalledWith('https://pod.example', 'https://pod.example/alice#me');
  });

  test('skips ATProto forwarding when a record report lacks a CID', async () => {
    const service = createService();
    const ctx = createCtx();
    service.listByContainer = jest.fn().mockResolvedValue([]);
    service.createManagedAtprotoSession = jest.fn().mockResolvedValue({ accessJwt: 'managed-access-token-1234567890' });

    const created = await service.createLocalModerationReport(
      ctx,
      'https://pod.example/alice#me',
      makeAtprotoReportInput({
        subject: {
          kind: 'object',
          object: {
            canonicalObjectId: 'at://did:plc:bob123/app.bsky.feed.post/abc123',
            atUri: 'at://did:plc:bob123/app.bsky.feed.post/abc123'
          },
          authoritativeProtocol: 'at'
        }
      })
    );

    const plan = await service.buildAtprotoModerationForwardingPlan(ctx, created.case, {
      canonicalIntentId: 'intent-at-2'
    });

    expect(plan).toEqual({
      status: 'skipped',
      reason: 'subject_resolution_failed'
    });
  });

  test('preserves and deep-merges ATProto forwarding state on case patches', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(
      ctx,
      'https://pod.example/alice#me',
      makeAtprotoReportInput()
    );

    let updated = await service.patchStoredModerationCase(created.case.id, {
      forwarding: {
        atproto: {
          status: 'pending',
          canonicalIntentId: 'd'.repeat(64),
          serviceDid: 'did:plc:labeler123',
          pdsUrl: 'https://pds.example',
          reporterDid: 'did:plc:alice123',
          subjectDid: 'did:plc:bob123'
        }
      }
    });

    expect(updated.forwarding.atproto).toMatchObject({
      status: 'pending',
      canonicalIntentId: 'd'.repeat(64),
      serviceDid: 'did:plc:labeler123',
      pdsUrl: 'https://pds.example/'
    });

    updated = await service.patchStoredModerationCase(created.case.id, {
      forwarding: {
        atproto: {
          status: 'delivered',
          reportId: 42,
          deliveredAt: '2026-04-22T12:06:00.000Z',
          lastStatusCode: 200
        }
      }
    });

    expect(updated.forwarding.atproto).toMatchObject({
      status: 'delivered',
      canonicalIntentId: 'd'.repeat(64),
      serviceDid: 'did:plc:labeler123',
      pdsUrl: 'https://pds.example/',
      reportId: 42,
      deliveredAt: '2026-04-22T12:06:00.000Z',
      lastStatusCode: 200
    });
  });
});
