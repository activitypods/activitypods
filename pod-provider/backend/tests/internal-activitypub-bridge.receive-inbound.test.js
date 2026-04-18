const serviceDefinition = require('../services/internal-activitypub-bridge-api.service');

describe('internal-activitypub-bridge receiveInbound', () => {
  function createServiceContext(overrides = {}) {
    return {
      settings: {
        maxActivityBytes: 262144,
        localInboxOrigins: 'http://localhost:3000',
        ...(overrides.settings || {})
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      ...serviceDefinition.methods,
      ...overrides
    };
  }

  test('accepts activity actor object form and forwards to inbox', async () => {
    const service = createServiceContext();
    const ctx = {
      params: {
        targetInbox: 'http://localhost:3000/alice/inbox',
        activity: {
          id: 'https://remote.example/activity/1',
          type: 'Create',
          actor: { id: 'https://remote.example/users/alice' },
          object: { type: 'Note', content: 'Hello' }
        },
        verifiedActorUri: 'https://remote.example/users/alice',
        receivedAt: Date.now(),
        remoteIp: '203.0.113.10'
      },
      meta: {},
      call: jest.fn().mockResolvedValue({ ok: true })
    };

    const result = await serviceDefinition.actions.receiveInbound.handler.call(service, ctx);

    expect(result).toEqual({ success: true });
    expect(ctx.meta.$statusCode).toBe(202);
    expect(ctx.call).toHaveBeenCalledWith(
      'activitypub.inbox.post',
      expect.objectContaining({ collectionUri: 'http://localhost:3000/alice/inbox' }),
      { meta: { webId: 'https://remote.example/users/alice', skipSignatureValidation: true } }
    );
  });

  test('accepts benchmark misses as 202 when inbox owner is missing', async () => {
    const service = createServiceContext();
    const ctx = {
      params: {
        targetInbox: 'http://localhost:3000/alice/inbox',
        activity: {
          id: 'https://remote.example/activity/2',
          type: 'Announce',
          actor: 'https://remote.example/users/alice'
        },
        verifiedActorUri: 'https://remote.example/users/alice',
        receivedAt: Date.now(),
        remoteIp: '198.51.100.20',
        benchmark: 'true'
      },
      meta: {},
      call: jest.fn().mockRejectedValue(new Error("Dataset alice doesn't exist"))
    };

    const result = await serviceDefinition.actions.receiveInbound.handler.call(service, ctx);

    expect(result).toEqual({ success: true, benchmarkAccepted: true, reason: 'not_found' });
    expect(ctx.meta.$statusCode).toBe(202);
  });

  test('rejects untrusted inbox origin', async () => {
    const service = createServiceContext();
    const ctx = {
      params: {
        targetInbox: 'https://evil.example/inbox',
        activity: {
          id: 'https://remote.example/activity/3',
          type: 'Like',
          actor: 'https://remote.example/users/alice'
        },
        verifiedActorUri: 'https://remote.example/users/alice',
        receivedAt: Date.now(),
        remoteIp: '203.0.113.10'
      },
      meta: {},
      call: jest.fn()
    };

    const result = await serviceDefinition.actions.receiveInbound.handler.call(service, ctx);

    expect(result.error).toBe('invalid_request');
    expect(ctx.meta.$statusCode).toBe(400);
    expect(ctx.call).not.toHaveBeenCalled();
  });

  test('rejects invalid remoteIp', async () => {
    const service = createServiceContext();
    const ctx = {
      params: {
        targetInbox: 'http://localhost:3000/alice/inbox',
        activity: {
          id: 'https://remote.example/activity/4',
          type: 'Create',
          actor: 'https://remote.example/users/alice'
        },
        verifiedActorUri: 'https://remote.example/users/alice',
        receivedAt: Date.now(),
        remoteIp: 'not-an-ip'
      },
      meta: {},
      call: jest.fn()
    };

    const result = await serviceDefinition.actions.receiveInbound.handler.call(service, ctx);

    expect(result.error).toBe('invalid_request');
    expect(ctx.meta.$statusCode).toBe(400);
    expect(ctx.call).not.toHaveBeenCalled();
  });
});
