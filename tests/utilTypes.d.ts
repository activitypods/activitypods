export declare async function waitForResource<T>(
  ms: number,
  fieldNames?: keyof T | string | (string | keyof T)[],
  maxTries: number,
  callback: () => T
): T;
