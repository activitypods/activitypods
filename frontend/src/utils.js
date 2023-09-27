const CESIUM_APP_URL = 'https://demo.cesium.app/#/app/wot/';
const CESIUM_APP_REGEX = /^https:\/\/demo\.cesium\.app\/#\/app\/wot\/([^\\]*)\//;

export const g1PublicKeyToUrl = value => {
  if (value && !value.startsWith(CESIUM_APP_URL)) {
    return CESIUM_APP_URL + value + '/';
  }
  return value;
};

export const g1UrlToPublicKey = value => {
  if (value && value.startsWith(CESIUM_APP_URL)) {
    const results = value.match(CESIUM_APP_REGEX);
    if (results) return results[1];
  }
  return value;
};

export const formatUsername = uri => {
  const url = new URL(uri);
  const username = url.pathname.split('/')[1];
  return '@' + username + '@' + url.host;
};

/**
 * Useful, to avoid having to check if the field is an array or not.
 * Useful for json-ld objects where a field can be a single value or an array.
 *
 * @param {*} value A non-array value, an array or undefined.
 * @returns
 */
export const arrayFromLdField = value => {
  // If the field is null-ish, we suppose there are no values.
  if (!value) {
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
 *
 * @param {string} value
 * @param {number} offset Optional.
 *  Min, max values for r, g, b between 0x00 and 0xff.
 *  Default min values are 0x50, max values 0xff.
 * @param {number} offset.r.min
 * @param {number} offset.r.max
 * @param {number} offset.g.min
 * @param {number} offset.g.max
 * @param {number} offset.b.min
 * @param {number} offset.b.max
 */
export const colorFromString = (value, offsets = {}) => {
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
  return '#' + hex;
};

/**
 * Return a number between 0 and one from a seed string.
 * @param {string} seed
 * @returns
 */
export const numberFromString = seed => {
  return Math.abs(
    Math.sin(
      seed.split('').reduce((a, b) => {
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
 *
 * @param {number} seed
 */
export const mulberry32 = seed => {
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
