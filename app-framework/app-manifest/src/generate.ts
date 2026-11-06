import { createHash } from 'node:crypto';
import { isSpecialRight, type AppManifest, type Necessity, type ShapeTreeNeed } from './manifest.ts';

export const CLIENT_DOCUMENT = 'app.json';

const NECESSITIES: Record<Necessity, string> = {
  required: 'interop:AccessRequired',
  optional: 'interop:AccessOptional'
};

const NEED_CONTEXT = {
  acl: 'http://www.w3.org/ns/auth/acl#',
  interop: 'http://www.w3.org/ns/solid/interop#',
  type: '@type',
  'interop:registeredShapeTree': { '@type': '@id' },
  'interop:accessMode': { '@type': '@id' },
  'interop:accessNecessity': { '@type': '@id' },
  'interop:preferredScope': { '@type': '@id' }
};

const GROUP_CONTEXT = {
  interop: 'http://www.w3.org/ns/solid/interop#',
  apods: 'http://activitypods.org/ns/core#',
  type: '@type',
  'interop:accessNecessity': { '@type': '@id' },
  'interop:accessScenario': { '@type': '@id' },
  'interop:authenticatedAs': { '@type': '@id' },
  'interop:hasAccessNeed': { '@type': '@id' },
  'apods:hasSpecialRights': { '@type': '@id' }
};

const APP_CONTEXT = [
  'https://www.w3.org/ns/solid/oidc-context.jsonld',
  {
    as: 'https://www.w3.org/ns/activitystreams#',
    interop: 'http://www.w3.org/ns/solid/interop#',
    oidc: 'http://www.w3.org/ns/solid/oidc#',
    dc: 'http://purl.org/dc/terms/',
    'interop:hasAccessNeedGroup': { '@type': '@id' },
    'interop:applicationAuthor': { '@type': '@id' },
    'interop:applicationThumbnail': { '@type': '@id' },
    'oidc:client_uri': { '@type': '@id' },
    'oidc:logo_uri': { '@type': '@id' },
    'oidc:tos_uri': { '@type': '@id' },
    'oidc:redirect_uris': { '@type': '@id' },
    'oidc:post_logout_redirect_uris': { '@type': '@id' }
  }
];

const hash = (content: unknown) => createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 12);

const translated = (description: AppManifest['description']) =>
  typeof description === 'string'
    ? description
    : Object.entries(description).map(([language, value]) => ({ '@value': value, '@language': language }));

/**
 * Generate the documents to serve, by path relative to the base URL.
 * Access needs and groups are named after their content, because the Pod provider
 * detects an upgrade when the URIs of the groups change.
 */
export const generateDocuments = (manifest: AppManifest, baseUrl: string) => {
  const url = (path: string) => new URL(path, baseUrl).href;
  const documents: Record<string, object> = {};
  const groupUris = [];

  for (const necessity of Object.keys(NECESSITIES) as Necessity[]) {
    const needs = manifest.accessNeeds[necessity] ?? [];
    if (!needs.length) continue;

    const needUris = needs
      .filter((need): need is ShapeTreeNeed => !isSpecialRight(need))
      .map(need => {
        const accessMode = [need.accessMode].flat().sort();
        const preferredScope = need.preferredScope ?? 'interop:All';
        const path = `access-needs/need-${hash([need.shapeTreeUri, accessMode, necessity, preferredScope])}.json`;
        documents[path] = {
          '@context': NEED_CONTEXT,
          '@id': url(path),
          id: url(path),
          type: 'interop:AccessNeed',
          'interop:registeredShapeTree': need.shapeTreeUri,
          'interop:accessMode': accessMode,
          'interop:accessNecessity': NECESSITIES[necessity],
          'interop:preferredScope': preferredScope
        };
        return url(path);
      })
      .sort();
    const specialRights = needs.filter(isSpecialRight).sort();

    const relativeNeeds = needUris.map(uri => uri.slice(url('').length));
    const path = `access-needs/group-${hash([necessity, relativeNeeds, specialRights])}.json`;
    documents[path] = {
      '@context': GROUP_CONTEXT,
      '@id': url(path),
      id: url(path),
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': NECESSITIES[necessity],
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeed': needUris,
      'apods:hasSpecialRights': specialRights.length ? specialRights : undefined
    };
    groupUris.push(url(path));
  }

  const clientId = url(CLIENT_DOCUMENT);
  const thumbnail = manifest.thumbnail && url(manifest.thumbnail.replace(/^\//, ''));
  const redirectUris = [url('login')];

  documents[CLIENT_DOCUMENT] = {
    '@context': APP_CONTEXT,
    client_id: clientId,
    id: clientId,
    redirect_uris: redirectUris,
    '@type': ['as:Application', 'interop:Application'],
    'as:name': manifest.name,
    'interop:applicationName': manifest.name,
    'interop:applicationDescription': translated(manifest.description),
    'interop:applicationAuthor': manifest.author,
    'interop:applicationThumbnail': thumbnail,
    'interop:hasAuthorizationCallbackEndpoint': url('login?register_app=true'),
    'interop:hasAccessNeedGroup': groupUris,
    'oidc:client_name': manifest.name,
    'oidc:redirect_uris': redirectUris,
    'oidc:post_logout_redirect_uris': [url('login?logout=true')],
    'oidc:client_uri': url(''),
    'oidc:logo_uri': thumbnail,
    'oidc:tos_uri': manifest.tosUri,
    'oidc:scope': 'openid profile offline_access webid',
    'oidc:grant_types': ['refresh_token', 'authorization_code'],
    'oidc:response_types': ['code'],
    'dc:language': manifest.supportedLocales
  };

  return documents;
};

export const serialize = (document: object) => `${JSON.stringify(document, null, 2)}\n`;
