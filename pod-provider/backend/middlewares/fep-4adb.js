'use strict';

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractActivityFromParams = params => {
  if (!isObject(params)) return { collectionUri: null, activity: null };
  const { collectionUri, ...activity } = params;
  return { collectionUri: collectionUri || null, activity: isObject(activity) ? activity : null };
};

const getDomainFromUri = value => {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('http://') && !value.startsWith('https://')) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

const mergeUniqueStrings = (...lists) => {
  const merged = lists.flat().filter(v => typeof v === 'string');
  return [...new Set(merged)];
};

const Fep4adbMiddleware = () => ({
  name: 'Fep4adbMiddleware',

  localAction(next, action) {
    const isInboxPost = action.name === 'activitypub.inbox.post';
    const isOutboxPost = action.name === 'activitypub.outbox.post';
    const isWebfingerGet = action.name === 'webfinger.get';

    if (!isInboxPost && !isOutboxPost && !isWebfingerGet) {
      return next;
    }

    return async ctx => {
      if ((isInboxPost || isOutboxPost) && isObject(ctx.params)) {
        const { collectionUri, activity } = extractActivityFromParams(ctx.params);

        if (activity) {
          const contextDomain =
            getDomainFromUri(collectionUri) ||
            getDomainFromUri(activity.id) ||
            getDomainFromUri(activity.actor) ||
            null;

          if (isInboxPost) {
            try {
              const processed = await ctx.call('fep-4adb-processor.processObject', {
                object: activity,
                contextDomain
              });
              ctx.params = collectionUri ? { collectionUri, ...processed } : processed;
            } catch (e) {
              ctx.service.logger.warn(`FEP-4adb inbound processing skipped: ${e.message}`);
            }
          }

          if (isOutboxPost) {
            const actorId =
              (typeof activity.actor === 'string' && activity.actor) ||
              (typeof ctx.meta?.webId === 'string' && ctx.meta.webId !== 'system' && ctx.meta.webId) ||
              null;

            if (actorId) {
              try {
                const prepared = await ctx.call('fep-4adb-outbound.prepareOutboundActivity', {
                  activity,
                  actorId
                });
                ctx.params = collectionUri ? { collectionUri, ...prepared } : prepared;
              } catch (e) {
                ctx.service.logger.warn(`FEP-4adb outbound preparation skipped: ${e.message}`);
              }
            }
          }
        }
      }

      const result = await next(ctx);

      if (isWebfingerGet && isObject(result)) {
        const links = Array.isArray(result.links) ? result.links : [];
        const actorHref =
          links.find(link => link && link.type === 'application/activity+json' && typeof link.href === 'string')?.href ||
          links.find(link => link && link.rel === 'self' && typeof link.href === 'string')?.href ||
          null;

        if (actorHref) {
          try {
            const aliases = await ctx.call('fep-4adb-dereferencer.listAliases', { actorId: actorHref });
            if (aliases.length > 0) {
              result.aliases = mergeUniqueStrings(result.aliases || [], aliases);
            }
          } catch (e) {
            ctx.service.logger.debug(`FEP-4adb webfinger alias enrichment skipped: ${e.message}`);
          }
        }
      }

      return result;
    };
  }
});

module.exports = Fep4adbMiddleware;
