// Characters that Node.js refuses in the HTTP status message (see checkInvalidHeaderChar in node:_http_common)
const INVALID_CHARS = /[^\t\x20-\x7e\x80-\xff]/g;

/**
 * The LDP API actions put the error message in ctx.meta.$statusMessage. A message that Node.js refuses, such as
 * a multi-line SPARQL error returned when Fuseki is overloaded, made moleculer-web throw outside of its error
 * handler, which crashed the whole backend. Replace these characters with spaces.
 */
const SanitizeStatusMessageMiddleware = () => ({
  name: 'SanitizeStatusMessageMiddleware',
  localAction(next: any) {
    return async (ctx: any) => {
      try {
        return await next(ctx);
      } finally {
        if (typeof ctx.meta.$statusMessage === 'string') {
          ctx.meta.$statusMessage = ctx.meta.$statusMessage.replace(INVALID_CHARS, ' ');
        }
      }
    };
  }
});

export default SanitizeStatusMessageMiddleware;
