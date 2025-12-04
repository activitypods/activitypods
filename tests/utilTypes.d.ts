import fetch from 'node-fetch';
import { ActionParamSchema, CallingOptions } from 'moleculer';

export type FetchOptions = Omit<fetch.RequestInit, 'body'> & {
  body?: ArrayBuffer | ArrayBufferView | ReadableStream | string | URLSearchParams | FormData | object;
  headers?: fetch.Headers;
};

export interface FetchResponse {
  status: number;
  statusText: string;
  headers: fetch.HeaderInit;
  body: string;
  json: object;
}

export interface TestActor {
  id: string;
  webId: string;
  token: string;
  baseUrl: string;
  username: string;
  call: (actionName: string, params?: ActionParamSchema, options?: CallingOptions) => Promise<any>;
  fetch: (url: string, options?: FetchOptions) => Promise<FetchResponse>;
  getContainerUri: (type: string) => Promise<string>;
  // Hard-code the possible properties of an actor...
  outbox: string;
  inbox: string;
  followers: string;
  following: string;
  url: string;
  preferredUsername: string;
  'foaf:nick': string;
  'apods:contacts': string;
  'apods:contactRequests': string;
  'apods:rejectedContacts': string;
  'pim:storage': string;
  'solid:oidcIssuer': string;
  'solid:publicTypeIndex': string;
  'interop:hasAuthorizationAgent': string;
  'interop:hasRegistrySet': string;
}

export interface TestApp {
  id: string;
  webId: string;
  username: string;
  call: (actionName: string, params?: ActionParamSchema, options?: CallingOptions) => Promise<any>;
  outbox: string;
  inbox: string;
  followers: string;
  following: string;
  'interop:hasAccessNeedGroup': string;
}
