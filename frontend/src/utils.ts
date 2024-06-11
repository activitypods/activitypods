/* eslint-disable no-bitwise */
const CESIUM_APP_URL = 'https://demo.cesium.app/#/app/wot/';
const CESIUM_APP_REGEX = /^https:\/\/demo\.cesium\.app\/#\/app\/wot\/([^\\]*)\//;

export const g1PublicKeyToUrl = (value: string) => {
  if (value && !value.startsWith(CESIUM_APP_URL)) {
    return `${CESIUM_APP_URL + value}/`;
  }
  return value;
};

export const g1UrlToPublicKey = (value: string) => {
  if (value && value.startsWith(CESIUM_APP_URL)) {
    const results = CESIUM_APP_REGEX.exec(value);
    if (results) return results[1];
  }
  return value;
};

export const formatUsername = (uri: string) => {
  const url = new URL(uri);
  const username = url.pathname.split('/')[1];
  return `@${username}@${url.host}`;
};

/**
 * Useful, to avoid having to check if the field is an array or not.
 * Useful for json-ld objects where a field can be a single value or an array.
 * @param {*} value A non-array value, an array or undefined.
 * @returns
 */
export const arrayFromLdField = (value: any | any[]) => {
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

export const isLocalHostname = (hostname: string) => {
  return new RegExp(`^${localhostRegex.source}$`).test(hostname);
};

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
  if (!/^.+\..+/.exec(url.hostname) && !isLocalHostname(url.hostname)) {
    return { error: 'app.validation.uri.no_tld' };
  }

  return { url, error };
};

export const localPodProviderObject = process.env.REACT_APP_POD_PROVIDER_URL
  ? {
      type: 'apods:PodProvider',
      'apods:area': process.env.POD_AREA,
      'apods:locales': 'en',
      'apods:domainName': new URL(process.env.REACT_APP_POD_PROVIDER_URL).host
    }
  : undefined;

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
