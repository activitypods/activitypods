'use strict';

const serviceDefinition = require('../services/dashboard/user-settings-api.service');

function createService(publishResult = { ok: true, canonicalIntentId: 'intent-123' }) {
  return {
    settings: {
      auditLogMaxEntries: 500,
      blueskyDefaultLabelerDid: 'did:plc:defaultlabeler123'
    },
    providerActors: new Set(['*']),
    logger: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    _auditLog: [],
    _moderationCases: [],
    _providerInboxEvents: [],
    _moderationCaseOperationChains: new Map(),
    _providerInboxEventOperationChain: Promise.resolve(),
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

      if (actionName === 'realtime-private-emitter.publish') {
        return { ok: true };
      }

      if (actionName === 'internal-identity-projection.getByDid') {
        return {
          webId: 'https://pod.example/alice#me'
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

  test('createModerationReport emits a private notification for the reporting user', async () => {
    const service = createService();
    const ctx = createCtx();
    ctx.meta = { webId: 'https://pod.example/alice#me' };
    ctx.params = { data: makeReportInput() };

    const result = await serviceDefinition.actions.createModerationReport.call(service, ctx);

    expect(result.data.id).toBeTruthy();
    expect(ctx.call).toHaveBeenCalledWith(
      'realtime-private-emitter.publish',
      expect.objectContaining({
        topic: 'notifications',
        event: 'notification',
        principal: 'https://pod.example/alice#me',
        payload: expect.objectContaining({
          kind: 'moderation.report.created',
          caseId: result.data.id
        })
      })
    );
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
    expect(service.createManagedAtprotoSession).toHaveBeenCalledWith(
      'https://pod.example',
      'https://pod.example/alice#me'
    );
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

  test('emits a report update notification when remote forwarding reaches a terminal state', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', makeReportInput());
    const previousCase = created.case;
    const nextCase = {
      ...previousCase,
      forwarding: {
        atproto: {
          status: 'delivered',
          serviceDid: 'did:plc:labeler123',
          pdsUrl: 'https://pds.example/',
          subjectDid: 'did:plc:bob123'
        }
      }
    };

    await service.emitModerationCaseUpdateNotifications(ctx, previousCase, nextCase);

    expect(ctx.call).toHaveBeenCalledWith(
      'realtime-private-emitter.publish',
      expect.objectContaining({
        principal: 'https://pod.example/alice#me',
        payload: expect.objectContaining({
          kind: 'moderation.report.updated',
          caseId: nextCase.id
        })
      })
    );
  });

  test('emits a report update notification when remote forwarding becomes pending', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', makeReportInput());

    await service.emitModerationCaseUpdateNotifications(ctx, created.case, {
      ...created.case,
      forwarding: {
        activityPub: {
          status: 'pending',
          canonicalIntentId: 'retry-intent-1'
        }
      }
    });

    expect(ctx.call).toHaveBeenCalledWith(
      'realtime-private-emitter.publish',
      expect.objectContaining({
        principal: 'https://pod.example/alice#me',
        payload: expect.objectContaining({
          kind: 'moderation.report.updated',
          forwarding: expect.objectContaining({
            activityPub: 'pending'
          })
        })
      })
    );
  });

  test('retryModerationCaseForwarding enables remote forwarding and requests ActivityPub retry', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', {
      ...makeReportInput(),
      requestedForwarding: { remote: false }
    });
    service.mrfProxy = jest.fn().mockResolvedValue({
      results: {
        activityPub: {
          status: 'queued',
          canonicalIntentId: 'retry-intent-1'
        }
      }
    });
    ctx.meta = { webId: 'https://provider.example/admin#me' };
    ctx.params = {
      id: created.case.id,
      data: {
        protocols: ['activityPub'],
        enableRemoteForwarding: true
      }
    };

    const result = await serviceDefinition.actions.retryModerationCaseForwarding.call(service, ctx);

    expect(service.mrfProxy).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        method: 'POST',
        path: `/internal/admin/moderation/cases/${encodeURIComponent(created.case.id)}/forwarding/retry`,
        permission: 'provider:write',
        body: { protocols: ['activityPub'] }
      })
    );
    expect(result.results.activityPub).toEqual(
      expect.objectContaining({
        status: 'queued',
        canonicalIntentId: 'retry-intent-1'
      })
    );
    expect(service.findStoredModerationCaseById(created.case.id)).toEqual(
      expect.objectContaining({
        requestedForwarding: { remote: true }
      })
    );
  });

  test('retryModerationCaseForwarding short-circuits when AT delivery already completed', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(
      ctx,
      'https://pod.example/alice#me',
      makeAtprotoReportInput()
    );
    await service.patchStoredModerationCase(created.case.id, {
      forwarding: {
        atproto: {
          status: 'delivered',
          canonicalIntentId: 'delivered-intent-1',
          subjectDid: 'did:plc:bob123'
        }
      }
    });
    service.mrfProxy = jest.fn();
    ctx.meta = { webId: 'https://provider.example/admin#me' };
    ctx.params = {
      id: created.case.id,
      data: {
        protocols: ['atproto']
      }
    };

    const result = await serviceDefinition.actions.retryModerationCaseForwarding.call(service, ctx);

    expect(service.mrfProxy).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.results.atproto).toEqual(
      expect.objectContaining({
        status: 'already-forwarded',
        canonicalIntentId: 'delivered-intent-1'
      })
    );
  });

  test('ingestProviderInboxEventInternal sanitizes and stores generic provider inbox events', async () => {
    const service = createService();
    const ctx = createCtx();
    ctx.params = {
      eventType: 'Like',
      activityId: 'https://remote.example/activities/1',
      actorUri: 'https://remote.example/users/bob',
      activityType: 'Like',
      envelopePath: '/actor/inbox',
      receivedAt: 'not-a-date',
      rawActivity: 'x'.repeat(40000)
    };

    const result = await serviceDefinition.actions.ingestProviderInboxEventInternal.call(service, ctx);

    expect(result.duplicate).toBe(false);
    expect(result.event).toEqual(
      expect.objectContaining({
        eventType: 'Generic',
        activityType: 'Like',
        activityId: 'https://remote.example/activities/1',
        actorUri: 'https://remote.example/users/bob',
        envelopePath: '/actor/inbox'
      })
    );
    expect(result.event.rawActivity).toHaveLength(32 * 1024);
    expect(Number.isNaN(Date.parse(result.event.receivedAt))).toBe(false);
    expect(service._providerInboxEvents).toHaveLength(1);
    expect(service.saveProviderData).toHaveBeenCalledWith('provider-inbox-events', service._providerInboxEvents);
  });

  test('ingestProviderInboxEventInternal rejects provider inbox events without an absolute actor URL', async () => {
    const service = createService();
    const ctx = createCtx();
    ctx.params = {
      eventType: 'Accept',
      activityId: 'https://remote.example/activities/2',
      actorUri: 'acct:bob@example.com',
      envelopePath: '/actor/inbox',
      receivedAt: new Date().toISOString(),
      rawActivity: {}
    };

    await expect(serviceDefinition.actions.ingestProviderInboxEventInternal.call(service, ctx)).rejects.toMatchObject({
      code: 400,
      type: 'VALIDATION_ERROR'
    });
    expect(service._providerInboxEvents).toHaveLength(0);
  });

  test('ingestProviderInboxEventInternal serializes UndoFlag ingest and preserves case status policy', async () => {
    const service = createService();
    const ctx = createCtx();
    const created = await service.createLocalModerationReport(ctx, 'https://pod.example/alice#me', makeReportInput());
    const originalFlagId = 'https://remote.example/activities/flag-1';
    service._moderationCases[0].canonicalEvent.sourceEventId = originalFlagId;
    const originalPatchStoredModerationCase = service.patchStoredModerationCase.bind(service);
    service.patchStoredModerationCase = jest.fn(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return originalPatchStoredModerationCase(...args);
    });

    const event = {
      eventType: 'UndoFlag',
      activityId: 'https://remote.example/activities/undo-1',
      actorUri: 'https://remote.example/users/bob',
      originalFlagId,
      envelopePath: '/users/provider/inbox',
      receivedAt: new Date().toISOString(),
      rawActivity: { type: 'Undo', object: originalFlagId }
    };

    const [first, second] = await Promise.all([
      serviceDefinition.actions.ingestProviderInboxEventInternal.call(service, { ...ctx, params: event }),
      serviceDefinition.actions.ingestProviderInboxEventInternal.call(service, { ...ctx, params: event })
    ]);

    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    expect(service._providerInboxEvents).toHaveLength(1);
    expect(service.patchStoredModerationCase).toHaveBeenCalledTimes(1);
    expect(service.findStoredModerationCaseById(created.case.id)).toEqual(
      expect.objectContaining({
        status: created.case.status,
        notes: expect.arrayContaining([
          expect.objectContaining({
            source: 'activitypub-undo-flag',
            originalFlagId
          })
        ])
      })
    );
  });

  test('emits a moderation decision notification for a local user resolved from DID', async () => {
    const service = createService();
    const ctx = createCtx();

    await service.emitModerationDecisionNotification(
      ctx,
      {
        id: 'decision-1',
        action: 'block',
        targetAtDid: 'did:plc:alice123',
        protocols: 'both'
      },
      'applied'
    );

    expect(ctx.call).toHaveBeenCalledWith(
      'internal-identity-projection.getByDid',
      expect.objectContaining({ atprotoDid: 'did:plc:alice123' })
    );
    expect(ctx.call).toHaveBeenCalledWith(
      'realtime-private-emitter.publish',
      expect.objectContaining({
        principal: 'https://pod.example/alice#me',
        payload: expect.objectContaining({
          kind: 'moderation.decision.applied',
          decisionId: 'decision-1',
          action: 'block',
          protocols: 'both'
        })
      })
    );
  });
});
