'use strict';

const {
  validateFilter,
  validateMuteOrBlock,
  validatePreference,
  validateAppConsent,
  validateForContainer,
  KNOWN_CONSENT_SCOPES,
  FILTER_ACTIONS
} = require('../services/dashboard/user-settings-validators');

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

  test('rejects missing pattern', () => {
    expect(validateFilter({ action: 'hide' })).toMatch(/pattern/);
    expect(validateFilter({})).toMatch(/pattern/);
    expect(validateFilter(null)).toMatch(/pattern/);
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
    expect(
      validateAppConsent({ clientId: 'my-app', permissions: ['read:moderation', 'app:overrides'] })
    ).toBeNull();
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

  test('returns null for unknown container (blocked upstream)', () => {
    expect(validateForContainer('unknown-container', {})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Service-level validation wiring (using Moleculer ServiceBroker)
// ---------------------------------------------------------------------------
const { ServiceBroker } = require('moleculer');
const UserSettingsApiService = require('../services/dashboard/user-settings-api.service');

describe('user-settings-api.create validation wiring', () => {
  let broker;

  beforeAll(async () => {
    broker = new ServiceBroker({ logger: false });
    broker.createService(UserSettingsApiService);

    // Stub the LDP services so we never hit real infrastructure
    broker.createService({
      name: 'ldp.container',
      actions: { post: async () => 'http://localhost/alice/data/res1' }
    });
    broker.createService({
      name: 'ldp.resource',
      actions: {
        get: async () => ({ '@id': 'http://localhost/alice/data/res1', type: 'apods:Filter', pattern: 'spam' }),
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

  const callerMeta = { webId: 'http://localhost/alice/profile/card#me' };

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
      broker.call('user-settings-api.create', { container: 'mutes', data: { subjectProtocol: 'ap' } }, { meta: callerMeta })
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
      broker.call('user-settings-api.create', { container: 'preferences', data: { value: 'dark' } }, { meta: callerMeta })
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

  test('remove rejects cross-user URI', async () => {
    await expect(
      broker.call(
        'user-settings-api.remove',
        { resourceUri: 'http://localhost/bob/data/res1' },
        { meta: callerMeta }
      )
    ).rejects.toMatchObject({ code: 403 });
  });
});
