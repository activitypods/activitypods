const serviceDefinition = require('../services/dashboard/user-settings-api.service');

describe('user-settings hashtag follows', () => {
  function createServiceContext() {
    const service = {
      settings: {
        atprotoMirrorMinIntervalSeconds: 300,
        blueskyDefaultLabelerEnabled: false
      },
      logger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
      },
      ...serviceDefinition.methods
    };

    let preferenceResource = null;

    service.listByContainer = async (_ctx, _webId, container) => {
      if (container !== 'preferences') return [];
      return preferenceResource ? [preferenceResource] : [];
    };

    service.createSettingsResource = async (_ctx, _webId, _container, data) => {
      preferenceResource = {
        '@id': 'http://localhost:3000/alice/data/settings/preferences/followed-hashtags',
        category: data.category,
        value: data.value
      };
      return preferenceResource['@id'];
    };

    const ctx = {
      meta: {
        webId: 'http://localhost:3000/alice/profile/card#me'
      },
      params: {},
      call: jest.fn(async (actionName, params) => {
        if (actionName === 'identitybindings.getByCanonicalAccountId') {
          return {
            canonicalAccountId: params.canonicalAccountId
          };
        }

        if (actionName === 'ldp.resource.put') {
          preferenceResource = {
            '@id': params.resourceUri,
            category: params.resource.category,
            value: params.resource.value
          };
          return true;
        }

        throw new Error(`Unexpected action call: ${actionName}`);
      })
    };

    return { service, ctx };
  }

  test('follows, lists, imports, and unfollows hashtags with canonical context', async () => {
    const { service, ctx } = createServiceContext();

    ctx.params = { data: { tag: '#Привет', includeCrossProtocol: true, includeRelated: true, notify: true } };
    const followResult = await serviceDefinition.actions.followHashtag.call(service, ctx);

    expect(followResult.data.canonicalAccountId).toBe('http://localhost:3000/alice/profile/card#me');
    expect(followResult.data.hashtag).toBe('привет');
    expect(followResult.data.hashtags).toHaveLength(1);

    ctx.params = {};
    const listResult = await serviceDefinition.actions.listFollowedHashtags.call(service, ctx);
    expect(listResult.data.hashtags.map(item => item.tag)).toEqual(['привет']);

    ctx.params = { data: { tags: '#Hello #Привет #ぼっち・ざ・ろっく', replace: false } };
    const importResult = await serviceDefinition.actions.importFollowedHashtags.call(service, ctx);
    expect(importResult.data.added).toBe(2);
    expect(importResult.data.total).toBe(3);

    ctx.params = { data: { tag: '#hello' } };
    const unfollowResult = await serviceDefinition.actions.unfollowHashtag.call(service, ctx);
    expect(unfollowResult.data.hashtags.map(item => item.tag)).toEqual(['привет', 'ぼっち・ざ・ろっく']);
  });

  test('rejects oversized hashtag import payloads', async () => {
    const { service, ctx } = createServiceContext();

    ctx.params = { data: { tags: '#a '.repeat(6000), replace: false } };
    await expect(serviceDefinition.actions.importFollowedHashtags.call(service, ctx)).rejects.toMatchObject({
      code: 400,
      type: 'VALIDATION_ERROR'
    });
  });

  test('rejects unreasonably long hashtag input', async () => {
    const { service, ctx } = createServiceContext();
    const tooLongTag = `#${'a'.repeat(300)}`;

    ctx.params = { data: { tag: tooLongTag } };
    await expect(serviceDefinition.actions.followHashtag.call(service, ctx)).rejects.toMatchObject({
      code: 400,
      type: 'VALIDATION_ERROR'
    });
  });
});
