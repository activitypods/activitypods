export declare async function waitForResource<T>(
  ms: number,
  fieldNames?: keyof T | string | (string | keyof T)[],
  maxTries: number,
  callback: () => T
): T;

export type FetchOptions = Omit<fetch.RequestInit, 'body'> & {
  body?: ArrayBuffer | ArrayBufferView | ReadableStream | string | URLSearchParams | FormData | object;
};
