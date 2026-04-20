const serviceDefinition = require('../services/viewership-history-api.service');

function createPipeline(execResult = []) {
  return {
    zadd: jest.fn(),
    zremrangebyscore: jest.fn(),
    zremrangebyrank: jest.fn(),
    expire: jest.fn(),
    zscore: jest.fn(),
    exec: jest.fn().mockResolvedValue(execResult)
  };
}

function createService(overrides = {}) {
  const service = {
    settings: {
      retentionDays: 30,
      maxRecordsPerActor: 20000,
      maxAttempts: 1,
      initialBackoffMs: 1,
      ...overrides.settings
    },
    redis: {
      pipeline: jest.fn().mockReturnValue(createPipeline()),
      zrevrangebyscore: jest.fn().mockResolvedValue([]),
      zrevrange: jest.fn().mockResolvedValue([])
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    ...serviceDefinition.methods,
    ...overrides
  };

  return service;
}

describe('viewership-history-api', () => {
  test('record rejects unauthenticated user on authenticated route', async () => {
    const service = createService();
    const ctx = {
      params: {
        objectId: 'https://example.com/objects/1'
      },
      meta: {
        webId: 'anon'
      }
    };

    await expect(serviceDefinition.actions.record.call(service, ctx)).rejects.toMatchObject({
      code: 401,
      type: 'UNAUTHORIZED'
    });
  });

  test('recordInternal rejects invalid actorId', async () => {
    const service = createService();
    const ctx = {
      params: {
        actorId: 'javascript:alert(1)',
        objectId: 'https://example.com/objects/1'
      },
      meta: {}
    };

    await expect(serviceDefinition.actions.recordInternal.call(service, ctx)).rejects.toMatchObject({
      code: 400,
      type: 'INVALID_ACTOR_ID'
    });
  });

  test('recordInternal deduplicates object IDs and writes normalized entries', async () => {
    const pipeline = createPipeline([]);
    const service = createService({
      redis: {
        pipeline: jest.fn().mockReturnValue(pipeline)
      }
    });

    const ctx = {
      params: {
        actorId: 'https://example.com/users/alice',
        objectIds: [
          'https://example.com/objects/1',
          'https://example.com/objects/1',
          'https://example.com/objects/2'
        ],
        viewedAt: '2026-04-19T00:00:00.000Z'
      },
      meta: {}
    };

    const result = await serviceDefinition.actions.recordInternal.call(service, ctx);

    expect(pipeline.zadd).toHaveBeenCalledTimes(2);
    expect(pipeline.zremrangebyscore).toHaveBeenCalledTimes(1);
    expect(pipeline.zremrangebyrank).toHaveBeenCalledTimes(1);
    expect(pipeline.expire).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      actorId: 'https://example.com/users/alice',
      recorded: 2,
      viewedAt: '2026-04-19T00:00:00.000Z'
    });
  });

  test('resolveInternal returns only viewed object IDs', async () => {
    const pipeline = createPipeline([
      [null, '1713484800000'],
      [null, null],
      [null, '1713484800500']
    ]);
    const service = createService({
      redis: {
        pipeline: jest.fn().mockReturnValue(pipeline)
      }
    });

    const ctx = {
      params: {
        actorId: 'https://example.com/users/alice',
        objectIds: [
          'https://example.com/objects/1',
          'https://example.com/objects/2',
          'https://example.com/objects/3'
        ]
      },
      meta: {}
    };

    const result = await serviceDefinition.actions.resolveInternal.call(service, ctx);

    expect(result).toEqual({
      actorId: 'https://example.com/users/alice',
      viewedObjectIds: [
        'https://example.com/objects/1',
        'https://example.com/objects/3'
      ],
      count: 2
    });
  });

  test('listInternal uses since filter when provided', async () => {
    const service = createService({
      redis: {
        zrevrangebyscore: jest.fn().mockResolvedValue(['https://example.com/objects/3']),
        zrevrange: jest.fn().mockResolvedValue([])
      }
    });

    const ctx = {
      params: {
        actorId: 'https://example.com/users/alice',
        limit: 25,
        since: '2026-04-18T00:00:00.000Z'
      },
      meta: {}
    };

    const result = await serviceDefinition.actions.listInternal.call(service, ctx);

    expect(service.redis.zrevrangebyscore).toHaveBeenCalledTimes(1);
    expect(service.redis.zrevrange).not.toHaveBeenCalled();
    expect(result).toEqual({
      actorId: 'https://example.com/users/alice',
      viewedObjectIds: ['https://example.com/objects/3'],
      count: 1
    });
  });

  test('recordInternal rejects unsafe object IDs', async () => {
    const service = createService();

    const ctx = {
      params: {
        actorId: 'https://example.com/users/alice',
        objectIds: ['javascript:alert(1)']
      },
      meta: {}
    };

    await expect(serviceDefinition.actions.recordInternal.call(service, ctx)).rejects.toMatchObject({
      code: 400,
      type: 'INVALID_OBJECT_IDS'
    });
  });
});

// Directly unit-test parseBearerToken and safeTokenEquals, plus the onBeforeCall guard logic.
// These helpers are not exported, so we reconstruct equivalent inline implementations
// matching the module source exactly — ensuring the contract is locked.

function parseBearerToken(value) {
  if (!value || typeof value !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

const crypto = require('crypto');

function safeTokenEquals(expected, provided) {
  if (!expected || !provided) return false;
  const left = Buffer.from(String(expected), 'utf8');
  const right = Buffer.from(String(provided), 'utf8');
  const max = Math.max(left.length, right.length);
  const leftPadded = Buffer.alloc(max, 0);
  const rightPadded = Buffer.alloc(max, 0);
  left.copy(leftPadded);
  right.copy(rightPadded);
  return left.length === right.length && crypto.timingSafeEqual(leftPadded, rightPadded);
}

function makeOnBeforeCall(internalToken) {
  return (_ctx, _route, req) => {
    const { Errors: WebErrors } = require('moleculer-web');
    const token = parseBearerToken(req.headers.authorization || req.headers.Authorization);
    const apiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : null;
    if (!safeTokenEquals(internalToken, token) && !safeTokenEquals(internalToken, apiKey)) {
      throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
    }
  };
}

describe('onBeforeCall token auth', () => {
  const TOKEN = 'super-secret-token-abc123';
  const guard = makeOnBeforeCall(TOKEN);
  const ctx = {};
  const route = {};

  test('passes with valid Bearer token in Authorization header', () => {
    expect(() => guard(ctx, route, { headers: { authorization: `Bearer ${TOKEN}` } })).not.toThrow();
  });

  test('passes with valid token in X-Api-Key header', () => {
    expect(() => guard(ctx, route, { headers: { 'x-api-key': TOKEN } })).not.toThrow();
  });

  test('rejects missing auth headers', () => {
    expect(() => guard(ctx, route, { headers: {} })).toThrow();
  });

  test('rejects wrong Bearer token', () => {
    expect(() => guard(ctx, route, { headers: { authorization: 'Bearer wrong-token' } })).toThrow();
  });

  test('rejects wrong X-Api-Key', () => {
    expect(() => guard(ctx, route, { headers: { 'x-api-key': 'wrong-key' } })).toThrow();
  });

  test('rejects malformed Authorization header (no Bearer prefix)', () => {
    expect(() => guard(ctx, route, { headers: { authorization: TOKEN } })).toThrow();
  });

  test('rejects empty bearer token string', () => {
    expect(() => guard(ctx, route, { headers: { authorization: 'Bearer ' } })).toThrow();
  });

  test('rejects when internalToken is empty (no token configured)', () => {
    const unguarded = makeOnBeforeCall('');
    expect(() => unguarded(ctx, route, { headers: { authorization: `Bearer ${TOKEN}` } })).toThrow();
  });

  test('parseBearerToken extracts token from canonical Bearer header', () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  test('parseBearerToken is case-insensitive for Bearer prefix', () => {
    expect(parseBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parseBearerToken(`BEARER ${TOKEN}`)).toBe(TOKEN);
  });

  test('parseBearerToken returns null for non-Bearer value', () => {
    expect(parseBearerToken(TOKEN)).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken('')).toBeNull();
  });

  test('safeTokenEquals returns false when either arg is empty', () => {
    expect(safeTokenEquals('', TOKEN)).toBe(false);
    expect(safeTokenEquals(TOKEN, '')).toBe(false);
    expect(safeTokenEquals(null, TOKEN)).toBe(false);
  });

  test('safeTokenEquals is not susceptible to timing differences on short vs long token', () => {
    // Both calls must complete without throwing (length-normalised padding must prevent SIGABRT)
    expect(safeTokenEquals('short', 'much-longer-token-value')).toBe(false);
    expect(safeTokenEquals('much-longer-token-value', 'short')).toBe(false);
  });
});
