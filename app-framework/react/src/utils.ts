export const formatUsername = (uri: string) => {
  const url = new URL(uri);
  const username = url.pathname.split('/')[1];
  return '@' + username + '@' + url.host;
};

/**
 * Useful, to avoid having to check if the field is an array or not.
 * Useful for json-ld objects where a field can be a single value or an array.
 */
export const arrayOf = (value: any | [any] | undefined) => {
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

export const delay = (t: number) => new Promise(resolve => setTimeout(resolve, t));
