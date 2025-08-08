import urlJoin from 'url-join';
import { FetchFn } from '@semapps/semantic-data-provider';
const VC_API_PATH = '/vc/v0.3';

const credentialContext = [
  'https://www.w3.org/ns/credentials/v2',
  {
    as: 'https://www.w3.org/ns/activitystreams#',
    apods: 'http://activitypods.org/ns/core#',
    acl: 'http://www.w3.org/ns/auth/acl#'
  }
];

export const formatUsername = (uri?: string) => {
  if (uri) {
    const url = new URL(uri);
    const username = url.pathname.split('/')[1];
    return `@${username}@${url.host}`;
  }
};

/**
 * Useful, to avoid having to check if the field is an array or not.
 * Useful for json-ld objects where a field can be a single value or an array.
 * @param {*} value A non-array value, an array or undefined.
 * @returns
 */
export const arrayOf = (value: any | any[]) => {
  // If the field is null-ish, we suppose there are no values.
  if (value === null || value === undefined) {
    return [];
  }
  // Return as is.
  if (Array.isArray(value)) {
    return value;
  }
  // Single value is made an array.
  return [value];
};

/**
 * Generate a random color using a string as seed.
 * @param {string} value The string to seed from.
 * @param {number} offset Optional.
 *  Min, max values for r, g, b between 0x00 and 0xff.
 *  Default min values are 0x50, max values 0xff.
 * @param {number} offset.r.min red min value
 * @param {number} offset.r.max red max value
 * @param {number} offset.g.min green min value
 * @param {number} offset.g.max green max value
 * @param {number} offset.b.min blue min value
 * @param {number} offset.b.max blue max value
 */
export const colorFromString = (value: string, offsets = {}) => {
  const colRange = {
    r: { min: 0x60, max: 0xff },
    g: { min: 0x60, max: 0xff },
    b: { min: 0x60, max: 0xff },
    ...offsets
  };

  // Generate some number between 0 and 1 from the string.
  const numFromString = numberFromString(value);
  // Use it to seed the random number generator
  const randomGenerator = mulberry32(Math.floor(numFromString * 0xfffffff));

  // Generate r,g,b values between 0 and 1.
  const r = randomGenerator();
  const g = randomGenerator();
  const b = randomGenerator();
  // Convert to a number between 0 and 0xFFFFFF, regard the offsets.
  const colorNumber =
    Math.floor(r * (colRange.r.max - colRange.r.min) + colRange.r.min) * 0x10000 +
    Math.floor(g * (colRange.g.max - colRange.g.min) + colRange.g.min) * 0x100 +
    Math.floor(b * (colRange.b.max - colRange.b.min) + colRange.b.min);

  // Convert to padded hex string.
  const hex = colorNumber.toString(16).padStart(6, '0');
  return `#${hex}`;
};

/**
 * Return a number between 0 and one from a seed string.
 * @param {string} seed The seed string to generate the number from.
 * @returns {number} An integer value
 */
export const numberFromString = (seed: string) => {
  // make next lines disable no-bitwise eslint using eslint block disable
  return Math.abs(
    Math.sin(
      seed.split('').reduce((a, b) => {
        // eslint-disable-next-line no-param-reassign
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0)
    )
  );
};

/**
 * Return a mulberry32 random number generator.
 * Generates numbers between 0 and 1.
 * See https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 * @param {number} seed A seed number.
 */
export const mulberry32 = (seed: number) => {
  function next() {
    let z = (seed += 0x9e3779b9) | 0; // the `| 0` coerces it into a 32-bit int
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 0x100000000;
  }
  return next;
};

export const localhostRegex = /(127\.0\.0\.[0-9]{1,3}|localhost|\[::1\])/;

export const isLocalURL = (url: string) => {
  return new RegExp(`^${localhostRegex.source}$`).test(new URL(url).hostname);
};

// Return true if the resource can be displayed in the data browser
// In dev mode, we can display resources of other storages (if we have permission)
export const isStorageUri = (url: string, webId: string) =>
  url &&
  (process.env.NODE_ENV === 'development'
    ? url.startsWith(CONFIG.BACKEND_URL)
    : url === webId || url.startsWith(webId + '/')) &&
  !url.endsWith('/sparql') &&
  !url.endsWith('/proxy') &&
  !url.endsWith('/openApp');

export const isUri = (uri: string) => {
  try {
    const url = new URL(uri);
    return url;
  } catch (e) {
    return false;
  }
};

/**
 * Validates a URL and returns an object containing the error message and the URL object.
 * @param {string} uriString - The URL to be validated.
 * @param {boolean} allowAddHttps - Whether to allow adding the HTTPS protocol to the URL string if it is missing.
 * @returns {object} An object containing the error message and the validated URL.
 */
export const validateUrl = (
  uriString: string,
  allowAddHttps: boolean
): { error: string; url: undefined } | { error: false; url: URL } => {
  const hasProtocol = (url: URL) => {
    return (url && url.protocol === 'http:') || (url && url.protocol === 'https:');
  };

  let url = isUri(uriString);
  if (!url && allowAddHttps) {
    // Try by adding protocol...
    url = isUri(`https://${uriString}`);
  }
  if (!url) {
    return { error: 'app.validation.url', url: undefined };
  }
  if (!hasProtocol(url)) {
    return { error: 'app.validation.uri.no_http', url: undefined };
  }
  return { error: false, url };
};

export const isBaseUrl = (url: URL) => {
  if (url.pathname === '/' && !url.search && !url.username && !url.password) {
    return url;
  }
  return false;
};

/**
 * Validate that the given string:
 * - Is a valid http(s) URI by the URL constructor (prepending `https` may be allowed).
 * - There is no path appended.
 * - The URL has a tld (e.g. .com) or is localhost, [::1], or 127.0.0.*
 */
export const validateBaseUrl = (uri: string, allowAddHttp: boolean) => {
  if (!uri) {
    return { error: 'ra.validation.required', url: undefined };
  }

  const { url, error } = validateUrl(uri, allowAddHttp);
  if (error !== false) {
    return { url, error };
  }

  if (!isBaseUrl(url)) {
    return { error: 'app.validation.uri.no_base_url', url };
  }

  // The URL must have a TLD (eg. `.com`), unless it's localhost.
  if (!/^.+\..+/.exec(url.hostname) && !isLocalURL(uri)) {
    return { error: 'app.validation.uri.no_tld' };
  }

  return { url, error };
};

export const localPodProviderObject = {
  type: 'apods:PodProvider',
  'apods:baseUrl': CONFIG.BACKEND_URL,
  'apods:locales': CONFIG.DEFAULT_LOCALE,
  'apods:area': CONFIG.INSTANCE_AREA,
  'apods:providedBy': CONFIG.INSTANCE_OWNER
};

/**
 * Removes duplicate items from a list.
 * Example:
 * ```js
 * uniqueBy(teacher => teacher.class,
 * [{class: "maths"}, {class: "maths"}, {class: "english"]
 * )
 * // returns [{class: "maths"}, {class: "english"}]
 * ```
 * @param criterion The criterion function to remove duplicates by.
 * @param values The values.
 */
export const uniqueBy = <T>(criterion: (value: T) => string, values: T[]) => {
  return Object.values(Object.fromEntries(values.map(v => [criterion(v), v])));
};

export const downloadFile = (blob: Blob, filename: string) => {
  // Fetch the data as a blob
  // Create a URL representing the blob
  const blobUrl = URL.createObjectURL(blob);

  // Create a new anchor element
  const a = document.createElement('a');

  // Set the href and download attributes of the anchor element
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';

  // Append the anchor element to the body
  document.body.appendChild(a);

  // Programmatically click the anchor element to start the download
  a.click();

  // Remove the anchor element from the body
  document.body.removeChild(a);

  // Revoke the blob URL
  URL.revokeObjectURL(blobUrl);
};

export const arraysEqual = (a1: [], a2: []): boolean =>
  arrayOf(a1).length === arrayOf(a2).length && arrayOf(a1).every(i => arrayOf(a2).includes(i));

export const delay = (t: number) => new Promise(resolve => setTimeout(resolve, t));

export const stripHtmlTags = (html: string) => {
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent;
  }
};

export const getLangString = (value: string | LangString[], locale: string): string | undefined => {
  if (Array.isArray(value)) {
    return (value.find(d => d['@language'] === locale) || value.find(d => d['@language'] === 'en'))?.['@value'];
  } else {
    return value;
  }
};

export const getWebIdFromResourceUri = (resourceUri: string) => {
  try {
    const uri = new URL(resourceUri);
    const username = /\/([^/]+)/.exec(uri.pathname)?.[1];
    return username && `${uri.origin}/${username}`;
  } catch (e) {
    return undefined;
  }
};

export const base64urlEncode = (str: string) => {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, byte => String.fromCodePoint(byte)).join('');
  return btoa(binString).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

export const createUnsignedJwt = (payload: object) => {
  const header = {
    typ: 'JWT',
    alg: 'none'
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  return `${encodedHeader}.${encodedPayload}.`;
};

/**
 * Fetch a resource with a VC capability.
 *
 * @param resourceUri The resource to fetch
 * @param capability The VC capability or it's URL
 * @param headers Optional headers for the resource fetch
 * @returns The response of a (regular) `fetch` request to the resource.
 */
export const fetchResourceWithCapability = async ({
  resourceUri,
  capability,
  headers = {}
}: {
  resourceUri: string;
  capability: string | object;
  headers: object;
}) => {
  if (!capability) throw new Error('No capability is provided.');
  // Fetch capability object, if necessary.
  // @ts-expect-error TS(2304): Cannot find name 'fetchUtils'.
  const capabilityObject = typeof capability === 'object' ? capability : (await fetchUtils.fetchJson(capability)).json;

  // Create presentation from capability object.
  const presentation = {
    '@context': credentialContext,
    type: 'VerifiablePresentation',
    verifiableCredential: [capabilityObject]
  };

  // Encode presentation as jwt token.
  const jwtPayload = createUnsignedJwt(presentation);

  // Send request with bearer token in authorization header.
  return fetch(resourceUri, {
    headers: {
      ...headers,
      Authorization: `Bearer ${jwtPayload}`
    }
  });
};

/**
 * Fetches all resources that a capability grants access to.
 *
 * @param capabilityUri URI of the capability which has a credentialSubject with `hasAuthorization`.
 * @returns JSON, if the result is json-ish, or a Blob, if the result is an image.
 */
export const fetchCapabilityResources = async (capabilityUri: string) => {
  return fetch(capabilityUri).then(async capRes => {
    if (!capRes.ok) {
      throw new Error('Capability fetch failed');
    }
    const capability = await capRes.json();
    // The capability has a credentialSubject with `hasAuthorization`
    const availableResources = arrayOf(capability?.credentialSubject?.['apods:hasAuthorization'])
      .map(auth => auth['acl:accessTo']?.id || auth['acl:accessTo'])
      .flatMap(res => res?.id || res);

    if (availableResources.length === 0) {
      throw new Error('Invite link capability is empty');
    }

    // Fetch all resources that the capability grants access to.
    return Promise.all(
      availableResources.map(async resourceUri => {
        const resourceRes = await fetchResourceWithCapability({
          resourceUri,
          capability,
          headers: { Accept: '*/*' }
        });
        if (!resourceRes.ok) throw new Error('Error fetching resource', { cause: resourceRes });
        if (resourceRes.headers.get('Content-Type')?.includes('json')) return resourceRes.json();
        if (resourceRes.headers.get('Content-Type')?.includes('image')) return resourceRes.blob();
      })
    );
  });
};

/** Creates a VC capability that's usable as an invite link. This returns the capability's URI, not the URI that the invitee can open in the frontend! */
export const createContactCapability = async (fetchFn: FetchFn, webIdDoc: any, profileDoc: any): Promise<string> => {
  const vcEndpointUri = urlJoin(webIdDoc?.id, VC_API_PATH);

  const result = await fetchFn(urlJoin(vcEndpointUri, 'credentials/issue'), {
    method: 'POST',
    body: JSON.stringify({
      credential: {
        '@context': credentialContext,
        type: 'VerifiableCredential',
        name: 'Invite Link',
        credentialSubject: {
          'apods:hasActivityGrant': {
            type: 'as:Offer',
            'as:to': { '@id': webIdDoc.id },
            'as:target': { '@id': webIdDoc.id },
            'as:object': {
              type: 'as:Add',
              'as:object': {
                type: 'as:Profile'
              }
            }
          },
          'apods:hasAuthorization': {
            type: 'acl:Authorization',
            'acl:mode': 'acl:Read',
            'acl:accessTo': [].concat(profileDoc.id, profileDoc['vcard:photo'] || []).map(uri => ({ '@id': uri }))
          }
        }
      }
    })
  }).catch(err => {
    throw new Error('Creating invite link capability failed. An error occurred while requesting the VC endpoint.', {
      cause: err
    });
  });

  const verifiableCredential = result.json;
  const link = verifiableCredential?.id;

  if (link && result.status >= 200 && result.status < 300) {
    return link;
  } else {
    throw new Error('Creating invite link capability failed. The VC endpoint returned an invalid response', {
      cause: result
    });
  }
};

/**
 * Create a Verifiable Presentation for a given Verifiable Credential.
 * Obtains a challenge from the verifier and signs the presentation
 * with the holder endpoint
 */
export const createPresentation = async ({
  fetchFn,
  holder,
  verifier,
  verifiableCredential
}: {
  fetchFn: FetchFn;
  holder: string;
  verifier: string;
  verifiableCredential: string | object;
}): Promise<any> => {
  // Fetch VC if not already an object.
  const vc =
    typeof verifiableCredential === 'string' ? (await fetchFn(verifiableCredential)).json : verifiableCredential;

  // Obtain challenge.
  const {
    json: { challenge }
  } = await fetchFn(urlJoin(verifier, VC_API_PATH, 'challenges'), {
    method: 'POST'
  });

  // Create/sign presentation from VC endpoint.
  const { json: presentation } = await fetchFn(urlJoin(holder, VC_API_PATH, 'presentations/'), {
    method: 'POST',
    body: JSON.stringify({
      presentation: {
        '@context': credentialContext,
        type: 'VerifiablePresentation',
        verifiableCredential: [vc]
      },
      options: {
        challenge,
        persist: false
      }
    })
  });

  return presentation;
};

// Check the value is a string starting with http and without any white space
export const isURL = (value: any) => typeof value === 'string' && value.startsWith('http') && !/\s/g.test(value);

// Check the value is a string starting with / and without any white space
export const isPath = (value: any) => typeof value === 'string' && value.startsWith('/') && !/\s/g.test(value);
