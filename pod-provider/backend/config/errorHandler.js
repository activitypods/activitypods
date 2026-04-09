'use strict';

/**
 * Moleculer broker-level error handler.
 *
 * Invoked for uncaught errors that escape the service action scope.
 * Normal action rejections are handled per-route via the route onError callback.
 *
 * Responsibilities:
 *   1. Assigns a correlation ID to every incident for cross-service tracing.
 *   2. Logs structured, production-safe error detail server-side.
 *   3. Suppresses raw stack traces and internal implementation detail in production.
 *
 * Reference:
 *   OWASP Error Handling Cheat Sheet
 *   https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
 *
 *   RFC 9457 — Problem Details for HTTP APIs (applied at the HTTP route layer)
 *   https://www.rfc-editor.org/rfc/rfc9457
 */

const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

/**
 * @param {Error} err
 * @param {{ service?: object, nodeID?: string }} info
 */
function errorHandler(err, info) {
  const correlationId = crypto.randomUUID();

  const logPayload = {
    correlationId,
    errorName:  err.name    || 'Error',
    errorCode:  err.code    || null,
    errorType:  err.type    || null,
    message:    err.message || 'Unknown error',
    service:    info?.service?.fullName || null,
    nodeID:     info?.nodeID            || null,
    // Never expose stack traces externally, but always capture server-side
    stack: isProd ? '[redacted]' : (err.stack || null)
  };

  // eslint-disable-next-line no-console
  console.error('[broker] uncaught error', JSON.stringify(logPayload));

  // When called from inside an action handler (info.ctx present), re-throw so the
  // error propagates through the call chain to moleculer-web's error handler.
  // For broker-level errors (ServiceNotFound during startup calls etc.) just log —
  // those originate outside any request context and have no HTTP response to fail.
  if (info && info.ctx) {
    throw err;
  }
}

module.exports = errorHandler;