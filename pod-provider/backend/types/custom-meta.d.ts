import type { IncomingHttpHeaders } from 'http';

declare global {
  export namespace Moleculer {
    /**
     * Application keys carried by `ctx.meta`, merged into the framework keys
     * declared in `types/moleculer/moleculer-inference-types.d.ts`.
     */
    interface ContextMeta {
      /** WebID of the caller, or `anon` for an unauthenticated request, or `system` for an internal call. */
      webId?: string;
      /** Name of the dataset the call operates on. */
      dataset?: string;
      /** WebID the caller acts on behalf of. */
      impersonatedUser?: string;
      /** Payload of the verified JWT. */
      tokenPayload?: { webId?: string; [key: string]: any };
      /** True when the call originates from the server itself rather than from the API. */
      isSystemCall?: boolean;

      /** Request headers, with `accept` and `content-type` replaced by their negotiated values. */
      headers?: IncomingHttpHeaders & { slug?: string; prefer?: string };
      /** Request headers as received, before content negotiation. */
      originalHeaders?: IncomingHttpHeaders;
      /** Unparsed request body. */
      rawBody?: string;
      /** Path and query string of the request. */
      requestUrl?: string;
      /** Parsed query string of the request. */
      queryString?: Record<string, any>;
      /** Set to `file` when the body was parsed as an upload. */
      parser?: string;
      /** Set by the `negotiateContentType` middleware, checked by `parseRawBody`. */
      contentTypeNegotiated?: boolean;
      /** Set by the `parseRawBody` middleware, checked by `parseJson`. */
      rawBodyParsed?: boolean;

      /** Do not emit the resource lifecycle events for this call. */
      skipEmitEvent?: boolean;
      /** Do not notify the objects watcher for this call. */
      skipObjectsWatcher?: boolean;
      /** Do not send the Create activities of new grants and social agent registrations (used by the 2.3.0 migration). */
      skipNotifications?: boolean;
      /** Accept the activity without verifying its HTTP signature. */
      skipSignatureValidation?: boolean;
      /** Do not apply the activity's side effects to its object. */
      doNotProcessObject?: boolean;
      /** Leave a tombstone behind when deleting a resource. */
      activateTombstones?: boolean;
    }
  }
}

export {};
