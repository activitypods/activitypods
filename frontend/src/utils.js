const CESIUM_APP_URL = 'https://demo.cesium.app/#/app/wot/';
const CESIUM_APP_REGEX = /^https:\/\/demo\.cesium\.app\/#\/app\/wot\/([^\\]*)\//;

export const g1PublicKeyToUrl = (value) => {
  if (value && !value.startsWith(CESIUM_APP_URL)) {
    return CESIUM_APP_URL + value + '/';
  }
  return value;
};

export const g1UrlToPublicKey = (value) => {
  if (value && value.startsWith(CESIUM_APP_URL)) {
    const results = value.match(CESIUM_APP_REGEX);
    if (results) return results[1];
  }
  return value;
};

export const formatUsername = (uri) => {
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
export const arrayFromLdField = (value) => {
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
 * @param {string} value
 */
export const colorFromString = (value) => {
  if (!value) return '#999999';
  // Generate some number between 0 and 1 from the string.
  const stringNumber = Math.abs(
    Math.sin(
      value.split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0)
    )
  );
  // Scale it to fit FFFFFF
  const scaled = Math.floor(stringNumber * 0x888888 + 0x888888);
  // Convert to padded hex string.
  const hex = scaled.toString(16).padStart(6, '0');
  return '#' + hex;
};
