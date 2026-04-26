const TARGET_ACTION = 'triplestore.deleteOrphanBlankNodes';
const WARNING_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Optional operational workaround for upstream SemApps/triplestore blank-node cleanup issues.
 *
 * This intentionally does not mirror upstream's unconditional no-op middleware. Cleanup is skipped
 * only when explicitly enabled by configuration, because disabling orphan blank-node cleanup can
 * increase triplestore bloat and should be treated as a temporary mitigation.
 */
module.exports = ({ enabled = false } = {}) => {
  let lastWarningAt = 0;

  return {
    name: 'SkipOrphanBlankNodesCleanupMiddleware',
    localAction(next, action) {
      if (!enabled || action.name !== TARGET_ACTION) {
        return next;
      }

      return async ctx => {
        const now = Date.now();
        if (now - lastWarningAt > WARNING_INTERVAL_MS) {
          lastWarningAt = now;
          ctx.broker.logger.warn(
            `${TARGET_ACTION} was skipped because SEMAPPS_SKIP_ORPHAN_BLANK_NODE_CLEANUP is enabled. ` +
              'This is a temporary workaround; monitor triplestore size and disable it once the underlying cleanup issue is resolved.'
          );
        }

        return {};
      };
    }
  };
};
