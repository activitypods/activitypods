'use strict';

const serviceDefinition = require('../services/dashboard/user-settings-api.service');

function createService(publishResult = { ok: true, canonicalIntentId: 'intent-123' }) {
  return {
    settings: {
      auditLogMaxEntries: 500
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
          atprotoHandle: 'alice.test'
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
});
