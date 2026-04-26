import { normalizeCapabilityResourceUris } from './capabilityResources';

describe('normalizeCapabilityResourceUris', () => {
  it('extracts the profile URI from the profile-only JSON-LD @id shape', () => {
    expect(
      normalizeCapabilityResourceUris({
        credentialSubject: {
          'apods:hasAuthorization': {
            type: 'acl:Authorization',
            'acl:mode': 'acl:Read',
            'acl:accessTo': { '@id': 'https://pod.example/alice/profile' }
          }
        }
      })
    ).toEqual(['https://pod.example/alice/profile']);
  });

  it('keeps compatibility with the previous profile-plus-photo array shape', () => {
    expect(
      normalizeCapabilityResourceUris({
        credentialSubject: {
          'apods:hasAuthorization': {
            type: 'acl:Authorization',
            'acl:mode': 'acl:Read',
            'acl:accessTo': [
              { '@id': 'https://pod.example/alice/profile' },
              { '@id': 'https://pod.example/alice/avatar.webp' }
            ]
          }
        }
      })
    ).toEqual(['https://pod.example/alice/profile', 'https://pod.example/alice/avatar.webp']);
  });

  it('supports string and compacted id resource references', () => {
    expect(
      normalizeCapabilityResourceUris({
        credentialSubject: {
          'apods:hasAuthorization': [
            {
              'acl:accessTo': 'https://pod.example/alice/profile'
            },
            {
              'acl:accessTo': { id: 'https://pod.example/alice/settings' }
            }
          ]
        }
      })
    ).toEqual(['https://pod.example/alice/profile', 'https://pod.example/alice/settings']);
  });

  it('filters missing or invalid access targets instead of passing them into fetch', () => {
    expect(
      normalizeCapabilityResourceUris({
        credentialSubject: {
          'apods:hasAuthorization': [
            {},
            { 'acl:accessTo': undefined },
            { 'acl:accessTo': { '@id': 42 } },
            { 'acl:accessTo': { id: null } },
            { 'acl:accessTo': { '@id': 'https://pod.example/alice/profile' } }
          ]
        }
      })
    ).toEqual(['https://pod.example/alice/profile']);
  });

  it('returns an empty list for missing authorizations', () => {
    expect(normalizeCapabilityResourceUris({})).toEqual([]);
  });
});
