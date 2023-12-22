const { delay } = require('@semapps/ldp');

const arrayOf = (value) => {
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
 * Call a callback and expect the result object to have all properties in `fieldNames`.
 * If not, try again after `delayMs` until `maxTries` is reached.
 * If `fieldNames` is `undefined`, the return value of `callback` is expected to not be
 * `undefined`.
 *
 * @type {import("./utilTypes").waitForResource}
 **/
const waitForResource = async (delayMs, fieldNames, maxTries, callback) => {
  for (let i = 0; i < maxTries; i += 1) {
    const result = await callback();
    // If a result (and the expected field, if required) is present, return.
    if (result !== undefined && arrayOf(fieldNames).every((fieldName) => Object.keys(result).includes(fieldName))) {
      return result;
    }
    await delay(delayMs);
  }
  throw new Error('Waiting for resource failed. No results after ' + maxTries + ' tries');
};

module.exports = {
  arrayOf,
  waitForResource,
};
