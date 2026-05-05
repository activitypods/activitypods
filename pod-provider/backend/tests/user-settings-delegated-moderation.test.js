'use strict';

const serviceDefinition = require('../services/dashboard/user-settings-api.service');

function createService(overrides = {}) {
  return {
    settings: {
      auditLogMaxEntries: 500,
      blueskyDefaultLabelerDid: 'did:plc:defaultlabeler123'
    },
    logger: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    ...serviceDefinition.methods,
    saveProviderData: jest.fn().mockResolvedValue(undefined),
    listByContainer: jest.fn().mockResolvedValue([]),
    findAppConsentForClient: jest.fn().mockResolvedValue(null),
    ...overrides
  };
}

function createCtx(overrides = {}) {
  const ctx = {
    meta: {
      webId: 'https://pod.example/users/alice#me',
      impersonatedUser: 'https://pod.example/users/bob#me',
      tokenPayload: null,
      ...overrides.meta
    },
    params: {
      data: { test: 'data' },
      resourceUri: 'https://pod.example/test/resource/123',
      ...overrides.params
    },
    call: jest.fn(async (actionName, params, opts) => {
      if (actionName === 'user-settings-api.create') {
        return { data: { id: 'created-123', ...params.data } };
      }
      if (actionName === 'user-settings-api.update') {
        return { data: { resourceUri: params.resourceUri, ...params.data } };
      }
      if (actionName === 'user-settings-api.remove') {
        return { ok: true };
      }
      throw new Error(`Unexpected action: ${actionName}`);
    }),
    ...overrides
  };

  return ctx;
}

describe('delegated-moderation-api', () => {
  describe('Authorization - Auth Failures', () => {
    test('listAppModerationPreferences rejects when no webId in context', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: undefined, impersonatedUser: 'https://pod.example/users/bob#me' }
      });

      await expect(serviceDefinition.actions.listAppModerationPreferences.call(service, ctx)).rejects.toMatchObject({
        message: expect.stringMatching(/unauthorized|webId/i)
      });
    });

    test('createAppModerationPreference rejects when no webId in context', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: undefined, impersonatedUser: 'https://pod.example/users/bob#me' }
      });

      await expect(serviceDefinition.actions.createAppModerationPreference.call(service, ctx)).rejects.toMatchObject({
        message: expect.stringMatching(/unauthorized|webId/i)
      });
    });

    test('listAppModerationBlocks rejects when no webId in context', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: undefined, impersonatedUser: 'https://pod.example/users/bob#me' }
      });

      await expect(serviceDefinition.actions.listAppModerationBlocks.call(service, ctx)).rejects.toMatchObject({
        message: expect.stringMatching(/unauthorized|webId/i)
      });
    });
  });

  describe('Authorization - Scope Failures (No Token, No Consent)', () => {
    test('listAppModerationPreferences denies delegated access without read:moderation scope', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue(null)
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No permissions
        }
      });

      await expect(serviceDefinition.actions.listAppModerationPreferences.call(service, ctx)).rejects.toMatchObject({
        code: 403,
        type: 'APP_CONSENT_REQUIRED'
      });
    });

    test('createAppModerationPreference denies delegated access without write:moderation scope', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue(null)
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No permissions
        }
      });

      await expect(serviceDefinition.actions.createAppModerationPreference.call(service, ctx)).rejects.toMatchObject({
        code: 403,
        type: 'APP_CONSENT_REQUIRED'
      });
    });

    test('listAppTrustSources denies delegated access without read:trust scope', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue(null)
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No permissions
        }
      });

      await expect(serviceDefinition.actions.listAppTrustSources.call(service, ctx)).rejects.toMatchObject({
        code: 403,
        type: 'APP_CONSENT_REQUIRED'
      });
    });

    test('createAppTrustSource denies delegated access without write:trust scope', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue(null)
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No permissions
        }
      });

      await expect(serviceDefinition.actions.createAppTrustSource.call(service, ctx)).rejects.toMatchObject({
        code: 403,
        type: 'APP_CONSENT_REQUIRED'
      });
    });
  });

  describe('Authorization - Consent Fallback (App Consent Grants Scope)', () => {
    test('listAppModerationPreferences allows delegated access with app-consent read:moderation', async () => {
      const service = createService({
        listByContainer: jest.fn().mockResolvedValue([
          {
            category: 'sensitive-media-display',
            value: 'warn'
          }
        ]),
        findAppConsentForClient: jest.fn().mockResolvedValue({
          permissions: ['read:moderation', 'write:moderation']
        })
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No token permissions, will use app consent
        }
      });

      const result = await serviceDefinition.actions.listAppModerationPreferences.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(service.findAppConsentForClient).toHaveBeenCalledWith(
        ctx,
        'https://pod.example/users/bob#me',
        'https://pod.example/apps/memory#me'
      );
    });

    test('createAppModerationPreference allows delegated access with app-consent write:moderation', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue({
          permissions: ['read:moderation', 'write:moderation']
        })
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No token permissions
        }
      });

      const result = await serviceDefinition.actions.createAppModerationPreference.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        expect.objectContaining({
          container: 'preferences',
          data: { test: 'data' }
        }),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/bob#me'
          }
        })
      );
    });

    test('listAppTrustSources allows delegated access with app-consent read:trust', async () => {
      const service = createService({
        listByContainer: jest.fn().mockResolvedValue([
          {
            sourceType: 'atproto-labeler',
            sourceId: 'did:plc:labeler123'
          }
        ]),
        findAppConsentForClient: jest.fn().mockResolvedValue({
          permissions: ['read:trust', 'write:trust']
        })
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No token permissions
        }
      });

      const result = await serviceDefinition.actions.listAppTrustSources.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    test('createAppTrustSource allows delegated access with app-consent write:trust', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue({
          permissions: ['read:trust', 'write:trust', 'read:moderation', 'write:moderation']
        })
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {} // No token permissions
        }
      });

      const result = await serviceDefinition.actions.createAppTrustSource.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        expect.objectContaining({
          container: 'trust-sources',
          data: { test: 'data' }
        }),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/bob#me'
          }
        })
      );
    });
  });

  describe('First-Party Access (No Delegation Required)', () => {
    test('listAppModerationPreferences allows first-party caller without impersonatedUser', async () => {
      const service = createService({
        listByContainer: jest.fn().mockResolvedValue([{ category: 'sensitive-media-display', value: 'warn' }])
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/users/alice#me',
          impersonatedUser: undefined
        }
      });

      const result = await serviceDefinition.actions.listAppModerationPreferences.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, 'https://pod.example/users/alice#me', 'preferences');
    });

    test('createAppModerationPreference allows first-party caller without impersonatedUser', async () => {
      const service = createService();

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/users/alice#me',
          impersonatedUser: undefined
        }
      });

      const result = await serviceDefinition.actions.createAppModerationPreference.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        expect.any(Object),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        })
      );
    });

    test('updateAppModerationPreference allows first-party caller', async () => {
      const service = createService();

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/users/alice#me',
          impersonatedUser: undefined
        }
      });

      const result = await serviceDefinition.actions.updateAppModerationPreference.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.update',
        expect.any(Object),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        })
      );
    });

    test('removeAppModerationPreference allows first-party caller', async () => {
      const service = createService();

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/users/alice#me',
          impersonatedUser: undefined
        }
      });

      const result = await serviceDefinition.actions.removeAppModerationPreference.call(service, ctx);

      expect(result.ok).toBe(true);
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.remove',
        expect.any(Object),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        })
      );
    });
  });

  describe('Success Paths - Preferences Container', () => {
    test('listAppModerationPreferences returns preferences data', async () => {
      const preferencesData = [
        { category: 'sensitive-media-display', value: 'warn' },
        { category: 'atproto-labeler-default-action', value: 'off' }
      ];

      const service = createService({
        listByContainer: jest.fn().mockResolvedValue(preferencesData)
      });

      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.listAppModerationPreferences.call(service, ctx);

      expect(result.data).toEqual(preferencesData);
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, ctx.meta.webId, 'preferences');
    });

    test('createAppModerationPreference delegates to user-settings-api.create', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.createAppModerationPreference.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        {
          container: 'preferences',
          data: { test: 'data' }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });

    test('updateAppModerationPreference delegates to user-settings-api.update', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          resourceUri: 'https://pod.example/prefs/sensitive-media',
          data: { value: 'hide' }
        }
      });

      const result = await serviceDefinition.actions.updateAppModerationPreference.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.update',
        {
          resourceUri: 'https://pod.example/prefs/sensitive-media',
          data: { value: 'hide' }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });

    test('removeAppModerationPreference delegates to user-settings-api.remove', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.removeAppModerationPreference.call(service, ctx);

      expect(result.ok).toBe(true);
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.remove',
        {
          resourceUri: 'https://pod.example/test/resource/123'
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });
  });

  describe('Success Paths - Trust Sources Container', () => {
    test('listAppTrustSources returns trust sources data', async () => {
      const trustSourcesData = [{ sourceType: 'atproto-labeler', sourceId: 'did:plc:labeler1', enabled: true }];

      const service = createService({
        listByContainer: jest.fn().mockResolvedValue(trustSourcesData)
      });

      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.listAppTrustSources.call(service, ctx);

      expect(result.data).toEqual(trustSourcesData);
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, ctx.meta.webId, 'trust-sources', {
        seedProviderDefaults: false,
        skipAtprotoMirror: true
      });
    });

    test('createAppTrustSource delegates to user-settings-api.create', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          data: {
            sourceType: 'atproto-labeler',
            sourceId: 'did:plc:newlabeler',
            displayName: 'Custom Labeler'
          }
        }
      });

      const result = await serviceDefinition.actions.createAppTrustSource.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        {
          container: 'trust-sources',
          data: {
            sourceType: 'atproto-labeler',
            sourceId: 'did:plc:newlabeler',
            displayName: 'Custom Labeler'
          }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });

    test('updateAppTrustSource delegates to user-settings-api.update', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          resourceUri: 'https://pod.example/trust/labeler-1',
          data: { enabled: false, actionMode: 'hide' }
        }
      });

      const result = await serviceDefinition.actions.updateAppTrustSource.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.update',
        {
          resourceUri: 'https://pod.example/trust/labeler-1',
          data: { enabled: false, actionMode: 'hide' }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });

    test('removeAppTrustSource delegates to user-settings-api.remove', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.removeAppTrustSource.call(service, ctx);

      expect(result.ok).toBe(true);
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.remove',
        {
          resourceUri: 'https://pod.example/test/resource/123'
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });
  });

  describe('Success Paths - Blocks Container', () => {
    test('listAppModerationBlocks returns blocks data', async () => {
      const blocksData = [{ subjectCanonicalId: 'https://remote.example/users/bob#me', blockedAt: new Date() }];

      const service = createService({
        listByContainer: jest.fn().mockResolvedValue(blocksData)
      });

      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.listAppModerationBlocks.call(service, ctx);

      expect(result.data).toEqual(blocksData);
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, ctx.meta.webId, 'blocks');
    });

    test('createAppModerationBlock delegates to user-settings-api.create', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          data: { subjectCanonicalId: 'https://remote.example/users/malicious#me' }
        }
      });

      const result = await serviceDefinition.actions.createAppModerationBlock.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        {
          container: 'blocks',
          data: { subjectCanonicalId: 'https://remote.example/users/malicious#me' }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });
  });

  describe('Success Paths - Mutes Container', () => {
    test('listAppModerationMutes returns mutes data', async () => {
      const mutesData = [{ subjectCanonicalId: 'https://remote.example/users/noisy#me', mutedAt: new Date() }];

      const service = createService({
        listByContainer: jest.fn().mockResolvedValue(mutesData)
      });

      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.listAppModerationMutes.call(service, ctx);

      expect(result.data).toEqual(mutesData);
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, ctx.meta.webId, 'mutes');
    });

    test('createAppModerationMute delegates to user-settings-api.create', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          data: { subjectCanonicalId: 'https://remote.example/users/chatty#me' }
        }
      });

      const result = await serviceDefinition.actions.createAppModerationMute.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        {
          container: 'mutes',
          data: { subjectCanonicalId: 'https://remote.example/users/chatty#me' }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });
  });

  describe('Success Paths - Filters Container', () => {
    test('listAppModerationFilters returns filters data', async () => {
      const filtersData = [{ keywords: ['spam', 'phishing'], caseSensitive: false }];

      const service = createService({
        listByContainer: jest.fn().mockResolvedValue(filtersData)
      });

      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.listAppModerationFilters.call(service, ctx);

      expect(result.data).toEqual(filtersData);
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, ctx.meta.webId, 'filters');
    });

    test('createAppModerationFilter delegates to user-settings-api.create', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          data: { keywords: ['cryptocurrency', 'NFT'] }
        }
      });

      const result = await serviceDefinition.actions.createAppModerationFilter.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        {
          container: 'filters',
          data: { keywords: ['cryptocurrency', 'NFT'] }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });

    test('updateAppModerationFilter delegates to user-settings-api.update', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: {
          resourceUri: 'https://pod.example/filter/spam-keywords',
          data: { keywords: ['spam', 'scam', 'phishing'] }
        }
      });

      const result = await serviceDefinition.actions.updateAppModerationFilter.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.update',
        {
          resourceUri: 'https://pod.example/filter/spam-keywords',
          data: { keywords: ['spam', 'scam', 'phishing'] }
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });

    test('removeAppModerationFilter delegates to user-settings-api.remove', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined }
      });

      const result = await serviceDefinition.actions.removeAppModerationFilter.call(service, ctx);

      expect(result.ok).toBe(true);
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.remove',
        {
          resourceUri: 'https://pod.example/test/resource/123'
        },
        {
          meta: {
            webId: 'https://pod.example/users/alice#me'
          }
        }
      );
    });
  });

  describe('Delegated Access - Owner Verification', () => {
    test('delegated caller receives owner webId in context for preferences', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue({
          permissions: ['read:moderation', 'write:moderation']
        })
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {}
        }
      });

      await serviceDefinition.actions.createAppModerationPreference.call(service, ctx);

      // Verify that the delegated action passes the owner webId to the internal action
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        expect.any(Object),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/bob#me' // owner, not app
          }
        })
      );
    });

    test('delegated caller receives owner webId in context for trust sources', async () => {
      const service = createService({
        findAppConsentForClient: jest.fn().mockResolvedValue({
          permissions: ['read:trust', 'write:trust']
        })
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/apps/memory#me',
          impersonatedUser: 'https://pod.example/users/bob#me',
          tokenPayload: {}
        }
      });

      await serviceDefinition.actions.createAppTrustSource.call(service, ctx);

      // Verify that the delegated action passes the owner webId, not the app webId
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        expect.any(Object),
        expect.objectContaining({
          meta: {
            webId: 'https://pod.example/users/bob#me' // owner, not app
          }
        })
      );
    });
  });

  describe('Edge Cases', () => {
    test('handles empty params in create action', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: { data: null }
      });

      const result = await serviceDefinition.actions.createAppModerationPreference.call(service, ctx);

      expect(result.data).toBeDefined();
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.create',
        {
          container: 'preferences',
          data: {}
        },
        expect.any(Object)
      );
    });

    test('handles whitespace in impersonatedUser', async () => {
      const service = createService({
        listByContainer: jest.fn().mockResolvedValue([])
      });

      const ctx = createCtx({
        meta: {
          webId: 'https://pod.example/users/alice#me',
          impersonatedUser: '  ' // Whitespace should be treated as empty
        }
      });

      const result = await serviceDefinition.actions.listAppModerationPreferences.call(service, ctx);

      // Whitespace impersonatedUser should be treated as first-party
      expect(service.listByContainer).toHaveBeenCalledWith(ctx, 'https://pod.example/users/alice#me', 'preferences');
    });

    test('removeAppModerationPreference uses resourceUri from query params as fallback', async () => {
      const service = createService();
      const ctx = createCtx({
        meta: { webId: 'https://pod.example/users/alice#me', impersonatedUser: undefined },
        params: { resourceUri: undefined },
        meta: {
          webId: 'https://pod.example/users/alice#me',
          impersonatedUser: undefined,
          $query: { resourceUri: 'https://pod.example/prefs/from-query' }
        }
      });

      const result = await serviceDefinition.actions.removeAppModerationPreference.call(service, ctx);

      expect(result.ok).toBe(true);
      expect(ctx.call).toHaveBeenCalledWith(
        'user-settings-api.remove',
        {
          resourceUri: 'https://pod.example/prefs/from-query'
        },
        expect.any(Object)
      );
    });
  });
});
