'use strict';

const {
  validateFilter,
  validateMuteOrBlock,
  validatePreference,
  validateAppConsent,
  validateTrustSource,
  validateForContainer,
  prepareAppConsent,
  prepareForContainer,
  KNOWN_CONSENT_SCOPES,
  FILTER_ACTIONS,
  CURRENT_SCHEMA_VERSION,
  TRUST_SOURCE_TYPES,
  TRUST_SOURCE_SCOPES
} = require('../lib/user-settings-validators');

// ---------------------------------------------------------------------------
// validateFilter
// ---------------------------------------------------------------------------
describe('validateFilter', () => {
  test('accepts valid filter with known action', () => {
    expect(validateFilter({ pattern: 'spam', action: 'hide' })).toBeNull();
    expect(validateFilter({ pattern: 'politics', action: 'warn' })).toBeNull();
    expect(validateFilter({ pattern: 'nsfw', action: 'filter' })).toBeNull();
  });

  test('accepts filter without action (action is optional)', () => {
    expect(validateFilter({ pattern: 'spam' })).toBeNull();
  });

  test('accepts current schemaVersion explicitly', () => {
    expect(validateFilter({ pattern: 'spam', schemaVersion: CURRENT_SCHEMA_VERSION })).toBeNull();
  });

  test('rejects missing pattern', () => {
    expect(validateFilter({ action: 'hide' })).toMatch(/pattern/);
    expect(validateFilter({})).toMatch(/pattern/);
    expect(validateFilter(null)).toMatch(/pattern/);
  });

  test('rejects unsupported schemaVersion', () => {
    expect(validateFilter({ pattern: 'spam', schemaVersion: 2 })).toMatch(/unsupported schemaVersion/);
  });

  test('rejects empty pattern string', () => {
    expect(validateFilter({ pattern: '   ' })).toMatch(/pattern/);
    expect(validateFilter({ pattern: '' })).toMatch(/pattern/);
  });

  test('rejects unknown action', () => {
    expect(validateFilter({ pattern: 'spam', action: 'delete' })).toMatch(/action/);
    expect(validateFilter({ pattern: 'spam', action: '' })).toMatch(/action/);
  });

  test('FILTER_ACTIONS covers hide, warn, filter', () => {
    expect([...FILTER_ACTIONS].sort()).toEqual(['filter', 'hide', 'warn']);
  });
});

// ---------------------------------------------------------------------------
// validateMuteOrBlock
// ---------------------------------------------------------------------------
describe('validateMuteOrBlock', () => {
  test('accepts valid mute/block record', () => {
    expect(validateMuteOrBlock({ subjectCanonicalId: '@alice@mastodon.social', subjectProtocol: 'ap' })).toBeNull();
  });

  test('rejects missing subjectCanonicalId', () => {
    expect(validateMuteOrBlock({ subjectProtocol: 'ap' })).toMatch(/subjectCanonicalId/);
    expect(validateMuteOrBlock({})).toMatch(/subjectCanonicalId/);
    expect(validateMuteOrBlock(null)).toMatch(/subjectCanonicalId/);
  });

  test('rejects empty subjectCanonicalId', () => {
    expect(validateMuteOrBlock({ subjectCanonicalId: '', subjectProtocol: 'ap' })).toMatch(/subjectCanonicalId/);
    expect(validateMuteOrBlock({ subjectCanonicalId: '  ', subjectProtocol: 'ap' })).toMatch(/subjectCanonicalId/);
  });

  test('rejects missing subjectProtocol', () => {
    expect(validateMuteOrBlock({ subjectCanonicalId: '@alice@mastodon.social' })).toMatch(/subjectProtocol/);
  });

  test('rejects empty subjectProtocol', () => {
    expect(validateMuteOrBlock({ subjectCanonicalId: '@alice@mastodon.social', subjectProtocol: '' })).toMatch(
      /subjectProtocol/
    );
  });
});

// ---------------------------------------------------------------------------
// validatePreference
// ---------------------------------------------------------------------------
describe('validatePreference', () => {
  test('accepts valid preference', () => {
    expect(validatePreference({ category: 'display', value: 'dark' })).toBeNull();
    expect(validatePreference({ category: 'language' })).toBeNull();
  });

  test('rejects missing category', () => {
    expect(validatePreference({ value: 'dark' })).toMatch(/category/);
    expect(validatePreference({})).toMatch(/category/);
    expect(validatePreference(null)).toMatch(/category/);
  });

  test('rejects empty category', () => {
    expect(validatePreference({ category: '' })).toMatch(/category/);
    expect(validatePreference({ category: '  ' })).toMatch(/category/);
  });
});

// ---------------------------------------------------------------------------
// validateAppConsent
// ---------------------------------------------------------------------------
describe('validateAppConsent', () => {
  test('accepts valid consent with single known scope', () => {
    expect(validateAppConsent({ clientId: 'my-app', permissions: ['read:moderation'] })).toBeNull();
  });

  test('accepts valid consent with multiple known scopes', () => {
    expect(validateAppConsent({ clientId: 'my-app', permissions: ['read:moderation', 'app:overrides'] })).toBeNull();
  });

  test('accepts all four known scopes', () => {
    expect(
      validateAppConsent({
        clientId: 'my-app',
        permissions: ['read:moderation', 'write:moderation', 'app:overrides', 'read:trust']
      })
    ).toBeNull();
  });

  test('rejects missing clientId', () => {
    expect(validateAppConsent({ permissions: ['read:moderation'] })).toMatch(/clientId/);
    expect(validateAppConsent({})).toMatch(/clientId/);
    expect(validateAppConsent(null)).toMatch(/clientId/);
  });

  test('rejects empty clientId', () => {
    expect(validateAppConsent({ clientId: '', permissions: ['read:moderation'] })).toMatch(/clientId/);
    expect(validateAppConsent({ clientId: '  ', permissions: ['read:moderation'] })).toMatch(/clientId/);
  });

  test('rejects empty permissions array', () => {
    expect(validateAppConsent({ clientId: 'my-app', permissions: [] })).toMatch(/scope/);
  });

  test('rejects write:moderation without read:moderation', () => {
    expect(validateAppConsent({ clientId: 'my-app', permissions: ['write:moderation'] })).toMatch(
      /requires read:moderation/
    );
  });

  test('rejects missing permissions', () => {
    expect(validateAppConsent({ clientId: 'my-app' })).toMatch(/scope/);
  });

  test('rejects unknown scope', () => {
    const result = validateAppConsent({ clientId: 'my-app', permissions: ['read:everything'] });
    expect(result).toMatch(/unknown/i);
    expect(result).toContain('read:everything');
  });

  test('rejects mix of valid and unknown scopes', () => {
    const result = validateAppConsent({ clientId: 'my-app', permissions: ['read:moderation', 'hack:all'] });
    expect(result).toMatch(/unknown/i);
    expect(result).toContain('hack:all');
    // 'hack:all' is the only bad scope — 'read:moderation' should not appear in the unknown portion
    expect(result.split('Allowed:')[0]).not.toContain('read:moderation');
  });

  test('KNOWN_CONSENT_SCOPES contains expected values', () => {
    expect([...KNOWN_CONSENT_SCOPES].sort()).toEqual(
      ['app:overrides', 'read:moderation', 'read:trust', 'write:moderation'].sort()
    );
  });

  test('prepareAppConsent normalizes permissions and injects schemaVersion', () => {
    const { data, error } = prepareAppConsent({
      clientId: '  my-app  ',
      permissions: ['read:moderation', 'read:moderation', 'app:overrides']
    });

    expect(error).toBeNull();
    expect(data.clientId).toBe('my-app');
    expect(data.permissions).toEqual(['read:moderation', 'app:overrides']);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

// ---------------------------------------------------------------------------
// validateTrustSource
// ---------------------------------------------------------------------------
describe('validateTrustSource', () => {
  test('accepts valid trust source', () => {
    expect(
      validateTrustSource({
        source: 'https://example.org/moderation/list',
        sourceType: 'list',
        enabled: true,
        weight: 0.8,
        scopes: ['filter:content', 'label:content']
      })
    ).toBeNull();
  });

  test('rejects invalid source URI', () => {
    expect(
      validateTrustSource({
        source: 'not-a-uri',
        sourceType: 'list',
        enabled: true,
        weight: 0.8,
        scopes: ['filter:content']
      })
    ).toMatch(/valid URI/);
  });

  test('rejects invalid sourceType', () => {
    expect(
      validateTrustSource({
        source: 'https://example.org/moderation/list',
        sourceType: 'magic',
        enabled: true,
        weight: 0.8,
        scopes: ['filter:content']
      })
    ).toMatch(/sourceType/);
  });

  test('rejects out-of-range weight', () => {
    expect(
      validateTrustSource({
        source: 'https://example.org/moderation/list',
        sourceType: 'list',
        enabled: true,
        weight: 1.5,
        scopes: ['filter:content']
      })
    ).toMatch(/between 0 and 1/);
  });

  test('rejects invalid trust source scope', () => {
    expect(
      validateTrustSource({
        source: 'https://example.org/moderation/list',
        sourceType: 'list',
        enabled: true,
        weight: 0.8,
        scopes: ['hack:all']
      })
    ).toMatch(/invalid trust source scope/);
  });

  test('prepareForContainer normalizes trust source defaults', () => {
    const { data, error } = prepareForContainer('trust-sources', {
      source: 'https://example.org/moderation/list',
      sourceType: 'list',
      scopes: ['filter:content', 'filter:content', 'label:content']
    });

    expect(error).toBeNull();
    expect(data.enabled).toBe(true);
    expect(data.weight).toBe(1);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.scopes).toEqual(['filter:content', 'label:content']);
  });

  test('trust source enums stay stable', () => {
    expect([...TRUST_SOURCE_TYPES].sort()).toEqual(['algorithmic', 'curator', 'list', 'relay']);
    expect([...TRUST_SOURCE_SCOPES].sort()).toEqual(
      ['filter:actor', 'filter:content', 'label:actor', 'label:content', 'rank:down', 'rank:up'].sort()
    );
  });
});

// ---------------------------------------------------------------------------
// validateForContainer dispatch
// ---------------------------------------------------------------------------
describe('validateForContainer', () => {
  test('dispatches to validateFilter for filters container', () => {
    expect(validateForContainer('filters', { pattern: 'spam' })).toBeNull();
    expect(validateForContainer('filters', {})).toMatch(/pattern/);
  });

  test('dispatches to validateMuteOrBlock for mutes container', () => {
    expect(validateForContainer('mutes', { subjectCanonicalId: '@x@y.social', subjectProtocol: 'ap' })).toBeNull();
    expect(validateForContainer('mutes', {})).toMatch(/subjectCanonicalId/);
  });

  test('dispatches to validateMuteOrBlock for blocks container', () => {
    expect(validateForContainer('blocks', { subjectCanonicalId: '@x@y.social', subjectProtocol: 'ap' })).toBeNull();
    expect(validateForContainer('blocks', {})).toMatch(/subjectCanonicalId/);
  });

  test('dispatches to validatePreference for preferences container', () => {
    expect(validateForContainer('preferences', { category: 'theme' })).toBeNull();
    expect(validateForContainer('preferences', {})).toMatch(/category/);
  });

  test('dispatches to validateAppConsent for app-consents container', () => {
    expect(validateForContainer('app-consents', { clientId: 'x', permissions: ['read:moderation'] })).toBeNull();
    expect(validateForContainer('app-consents', {})).toMatch(/clientId/);
  });

  test('dispatches to validateTrustSource for trust-sources container', () => {
    expect(
      validateForContainer('trust-sources', {
        source: 'https://example.org/moderation/list',
        sourceType: 'list',
        enabled: true,
        weight: 0.7,
        scopes: ['filter:content']
      })
    ).toBeNull();
    expect(validateForContainer('trust-sources', {})).toMatch(/source/);
  });

  test('returns null for unknown container (blocked upstream)', () => {
    expect(validateForContainer('unknown-container', {})).toBeNull();
  });

  test('prepareForContainer injects schemaVersion for filter records', () => {
    const { data, error } = prepareForContainer('filters', { pattern: 'spam', action: 'hide' });

    expect(error).toBeNull();
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.pattern).toBe('spam');
    expect(data.action).toBe('hide');
  });
});

// ---------------------------------------------------------------------------
// Service-level validation wiring (using Moleculer ServiceBroker)
// ---------------------------------------------------------------------------
const { ServiceBroker } = require('moleculer');
const UserSettingsApiService = require('../services/dashboard/user-settings-api.service');

describe('user-settings-api.create validation wiring', () => {
  let broker;
  let lastPostedResource;
  let lastPutResource;

  beforeAll(async () => {
    broker = new ServiceBroker({ logger: false });
    broker.createService(UserSettingsApiService);

    // Stub the LDP services so we never hit real infrastructure
    broker.createService({
      name: 'ldp.container',
      actions: {
        post: async ctx => {
          lastPostedResource = ctx.params.resource;
          return 'http://localhost/alice/data/res1';
        }
      }
    });
    broker.createService({
      name: 'ldp.resource',
      actions: {
        get: async ctx => {
          if (ctx.params.resourceUri === 'http://localhost/alice/data/trust1') {
            return {
              '@id': 'http://localhost/alice/data/trust1',
              type: 'apods:TrustSource',
              source: 'https://example.org/moderation/list',
              sourceType: 'list',
              enabled: true,
              weight: 0.5,
              scopes: ['filter:content'],
              schemaVersion: CURRENT_SCHEMA_VERSION
            };
          }

          if (ctx.params.resourceUri === 'http://localhost/alice/data/consent1') {
            return {
              '@id': 'http://localhost/alice/data/consent1',
              type: 'apods:AppConsent',
              clientId: 'my-app',
              permissions: ['read:moderation'],
              schemaVersion: CURRENT_SCHEMA_VERSION
            };
          }

          return {
            '@id': 'http://localhost/alice/data/res1',
            type: 'apods:Filter',
            pattern: 'spam',
            action: 'hide',
            schemaVersion: CURRENT_SCHEMA_VERSION
          };
        },
        put: async ctx => {
          lastPutResource = ctx.params.resource;
          return true;
        },
        delete: async () => true
      }
    });
    broker.createService({
      name: 'api',
      actions: { addRoute: async () => true }
    });

    await broker.start();
  });

  afterAll(() => broker.stop());

  const callerMeta = { webId: 'http://localhost/alice#me' };

  test('filter create rejects missing pattern', async () => {
    await expect(
      broker.call('user-settings-api.create', { container: 'filters', data: { action: 'hide' } }, { meta: callerMeta })
    ).rejects.toMatchObject({ code: 400 });
  });

  test('filter create rejects unknown action', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        { container: 'filters', data: { pattern: 'spam', action: 'delete' } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('mute create rejects missing subjectCanonicalId', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        { container: 'mutes', data: { subjectProtocol: 'ap' } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('block create rejects missing subjectProtocol', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        { container: 'blocks', data: { subjectCanonicalId: '@x@y.social' } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('preference create rejects missing category', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        { container: 'preferences', data: { value: 'dark' } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('trust-source create rejects invalid sourceType', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        {
          container: 'trust-sources',
          data: {
            source: 'https://example.org/moderation/list',
            sourceType: 'magic',
            enabled: true,
            weight: 0.8,
            scopes: ['filter:content']
          }
        },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('trust-source create rejects invalid scope', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        {
          container: 'trust-sources',
          data: {
            source: 'https://example.org/moderation/list',
            sourceType: 'list',
            enabled: true,
            weight: 0.8,
            scopes: ['hack:all']
          }
        },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('createAppConsent rejects unknown scope', async () => {
    await expect(
      broker.call(
        'user-settings-api.createAppConsent',
        { data: { clientId: 'my-app', permissions: ['read:everything'] } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('createAppConsent rejects missing clientId', async () => {
    await expect(
      broker.call(
        'user-settings-api.createAppConsent',
        { data: { permissions: ['read:moderation'] } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('create rejects unknown container', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        { container: 'evil-container', data: { foo: 'bar' } },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('create rejects unauthenticated caller', async () => {
    await expect(
      broker.call('user-settings-api.create', { container: 'filters', data: { pattern: 'spam' } }, { meta: {} })
    ).rejects.toMatchObject({ code: 401 });
  });

  test('create rejects anon caller', async () => {
    await expect(
      broker.call(
        'user-settings-api.create',
        { container: 'filters', data: { pattern: 'spam' } },
        { meta: { webId: 'anon' } }
      )
    ).rejects.toMatchObject({ code: 401 });
  });

  test('create writes schemaVersion=1 when omitted', async () => {
    await broker.call(
      'user-settings-api.create',
      { container: 'filters', data: { pattern: 'spam' } },
      { meta: callerMeta }
    );

    expect(lastPostedResource.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(lastPostedResource.pattern).toBe('spam');
  });

  test('createAppConsent writes normalized permissions and schemaVersion', async () => {
    await broker.call(
      'user-settings-api.createAppConsent',
      {
        data: {
          clientId: '  my-app  ',
          permissions: ['read:moderation', 'read:moderation', 'app:overrides']
        }
      },
      { meta: callerMeta }
    );

    expect(lastPostedResource.clientId).toBe('my-app');
    expect(lastPostedResource.permissions).toEqual(['read:moderation', 'app:overrides']);
    expect(lastPostedResource.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('create trust-source writes normalized defaults', async () => {
    await broker.call(
      'user-settings-api.create',
      {
        container: 'trust-sources',
        data: {
          source: 'https://example.org/moderation/list',
          sourceType: 'list',
          scopes: ['filter:content', 'filter:content', 'label:content']
        }
      },
      { meta: callerMeta }
    );

    expect(lastPostedResource.enabled).toBe(true);
    expect(lastPostedResource.weight).toBe(1);
    expect(lastPostedResource.scopes).toEqual(['filter:content', 'label:content']);
    expect(lastPostedResource.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('update rejects invalid schemaVersion', async () => {
    await expect(
      broker.call(
        'user-settings-api.update',
        {
          resourceUri: 'http://localhost/alice/data/res1',
          data: { schemaVersion: 2 }
        },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('update validates app consent scope relationships', async () => {
    await expect(
      broker.call(
        'user-settings-api.update',
        {
          resourceUri: 'http://localhost/alice/data/consent1',
          data: { permissions: ['write:moderation'] }
        },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('update rejects immutable app consent clientId changes', async () => {
    await expect(
      broker.call(
        'user-settings-api.update',
        {
          resourceUri: 'http://localhost/alice/data/consent1',
          data: { clientId: 'other-app' }
        },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('update validates trust-source partial updates', async () => {
    await expect(
      broker.call(
        'user-settings-api.update',
        {
          resourceUri: 'http://localhost/alice/data/trust1',
          data: { weight: 3 }
        },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 400 });
  });

  test('update writes valid trust-source partial updates', async () => {
    await broker.call(
      'user-settings-api.update',
      {
        resourceUri: 'http://localhost/alice/data/trust1',
        data: { weight: 0.9, scopes: ['filter:content', 'rank:down'] }
      },
      { meta: callerMeta }
    );

    expect(lastPutResource.weight).toBe(0.9);
    expect(lastPutResource.scopes).toEqual(['filter:content', 'rank:down']);
    expect(lastPutResource.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('update keeps normalized schemaVersion on valid writes', async () => {
    await broker.call(
      'user-settings-api.update',
      {
        resourceUri: 'http://localhost/alice/data/res1',
        data: { pattern: '  ham  ' }
      },
      { meta: callerMeta }
    );

    expect(lastPutResource.pattern).toBe('ham');
    expect(lastPutResource.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('remove rejects cross-user URI', async () => {
    await expect(
      broker.call('user-settings-api.remove', { resourceUri: 'http://localhost/bob/data/res1' }, { meta: callerMeta })
    ).rejects.toMatchObject({ code: 403 });
  });
});
