const serviceDefinition = require('../services/realtime-private-emitter.service');

function createService(overrides = {}) {
  return {
    settings: {
      channel: 'fep3ab2:private-events'
    },
    redis: {
      publish: jest.fn().mockResolvedValue(1)
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    ...overrides
  };
}

describe('realtime-private-emitter', () => {
  test('publishes principal-scoped private realtime messages', async () => {
    const service = createService();
    const ctx = {
      params: {
        topic: 'notifications',
        event: 'notification',
        principal: 'https://example.com/users/alice',
        id: 'notif-1',
        payload: {
          topic: 'notifications',
          reason: 'created'
        }
      },
      meta: {}
    };

    const result = await serviceDefinition.actions.publish.call(service, ctx);

    expect(service.redis.publish).toHaveBeenCalledWith(
      'fep3ab2:private-events',
      expect.stringContaining('"principal":"https://example.com/users/alice"')
    );
    expect(result).toEqual({
      ok: true,
      channel: 'fep3ab2:private-events',
      topic: 'notifications',
      principal: 'https://example.com/users/alice'
    });
    expect(ctx.meta.$statusCode).toBe(202);
  });

  test('rejects invalid topics', async () => {
    const service = createService();
    const ctx = {
      params: {
        topic: 'feeds/global',
        event: 'feed',
        principal: 'https://example.com/users/alice',
        payload: {
          topic: 'feeds/global'
        }
      },
      meta: {}
    };

    await expect(
      serviceDefinition.actions.publish.call(service, ctx)
    ).rejects.toMatchObject({
      code: 400,
      type: 'INVALID_TOPIC'
    });
  });
});
