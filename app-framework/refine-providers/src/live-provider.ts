import type { LiveEvent, LiveProvider } from '@refinedev/core';
import { arrayOf, DEFAULT_CONTEXT, fetchStorage, invalidateStorage } from './utils';
import { notifyAccessChange } from './grants';
import { objectId, subscribeToTopic } from './notifications';
import { storagesResolver } from './storages';
import { AuthSession, LiveProviderConfig, ResourceConfig, UnwatchFn } from './types';

const ACTIVITY_TYPE_MAP: Record<string, LiveEvent['type']> = {
  Create: 'created',
  Add: 'created',
  Update: 'updated',
  Delete: 'deleted',
  Remove: 'deleted'
};

const PUBLIC_REGISTRATION_PREDICATES = ['interop:hasPublicAgentRegistration', 'interop:hasConnectedAgentRegistration'];

// The storage is watched too, as it is updated when one of these registrations is created
const watchPublicRegistrations = async (
  storageUri: string,
  session: AuthSession,
  onChange: () => void
): Promise<UnwatchFn> => {
  const watched = new Map<string, Promise<UnwatchFn>>();
  const watchRegistrations = async () => {
    const storage = await fetchStorage(storageUri, session).catch(() => ({}) as Record<string, any>);
    for (const uri of PUBLIC_REGISTRATION_PREDICATES.map(p => storage[p]).filter(Boolean)) {
      if (!watched.has(uri)) watched.set(uri, subscribeToTopic(uri, session, onChange));
    }
  };

  const unwatchStorage = await subscribeToTopic(storageUri, session, async () => {
    invalidateStorage(storageUri);
    await watchRegistrations();
    onChange();
  });
  await watchRegistrations();

  return () => {
    unwatchStorage();
    watched.forEach(unwatch => unwatch.then(fn => fn()).catch(() => undefined));
  };
};

/**
 * Refine live provider for ActivityPods, built on the Solid Notifications Protocol's
 * `WebSocketChannel2023` channel. Since a channel only ever watches a single topic:
 *
 * - Watching specific record(s) (`params.id`/`params.ids`) opens one channel per record,
 *   listening for `Update`/`Delete` activities on that resource.
 * - Watching a whole list opens a channel on each container of the resource, listening for
 *   `Add`/`Remove` activities (container membership changes) — a container doesn't notify
 *   about an existing member's own fields changing, so list views won't see `updated` events
 *   this way; open the record itself (e.g. via `useShow`/`useOne`) to catch those.
 *
 * Nothing is watched if the user is not logged in.
 */
const liveProvider = ({
  resources,
  authProvider,
  storages,
  jsonContext = DEFAULT_CONTEXT,
  readAccessGrants
}: LiveProviderConfig): LiveProvider => {
  const { resolveListSources } = storagesResolver({ resources, storages, jsonContext, readAccessGrants });

  return {
    subscribe: async ({ channel, params, callback }) => {
      const session = authProvider.getSession();
      if (!session) return (() => undefined) as UnwatchFn;

      const resourceId = (params as any)?.resource || channel.split('/')[1];
      const resourceConfig: ResourceConfig | undefined = resources[resourceId];
      if (!resourceId || !resourceConfig) return (() => undefined) as UnwatchFn;

      const ids = arrayOf<any>((params as any)?.ids ?? (params as any)?.id).map(id => `${id}`);

      const emit = (type: LiveEvent['type'], ids2: string[], date: Date) => {
        if (ids2.length === 0) return;
        callback({ channel, type, payload: { ids: ids2 }, date });
      };

      if (ids.length > 0) {
        const unwatchFns = await Promise.all(
          ids.map(id =>
            subscribeToTopic(id, session, activity => {
              const type = ACTIVITY_TYPE_MAP[activity.type];
              if (type) emit(type, [id], new Date(activity.published ?? Date.now()));
            })
          )
        );
        return () => unwatchFns.forEach(fn => fn());
      }

      const { containers, resources: resourcesSources } = await resolveListSources(resourceId, session);

      const refreshList = (storageUri: string) => {
        invalidateStorage(storageUri);
        notifyAccessChange(session.webId);
        callback({ channel, type: '*', payload: {}, date: new Date() });
      };

      const results = await Promise.allSettled([
        ...containers.map(({ uri }) =>
          subscribeToTopic(uri, session, activity => {
            const type = ACTIVITY_TYPE_MAP[activity.type];
            const id = objectId(activity.object);
            if (type && id) emit(type, [id], new Date(activity.published ?? Date.now()));
          })
        ),
        // The grants given to everyone or to connected users change when data is made public or private
        ...[...new Set([...containers, ...resourcesSources].map(({ storage }) => storage))].map(storageUri =>
          watchPublicRegistrations(storageUri, session, () => refreshList(storageUri))
        )
      ]);
      const unwatchFns: UnwatchFn[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') unwatchFns.push(result.value);
        else console.warn(`Could not watch the resources of "${resourceId}"`, result.reason);
      });
      if (unwatchFns.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason;
      return () => unwatchFns.forEach(fn => fn());
    },

    unsubscribe: async (unsubscribeFn: UnwatchFn | Promise<UnwatchFn>) => {
      const fn = await Promise.resolve(unsubscribeFn);
      if (typeof fn === 'function') fn();
    }
  };
};

export default liveProvider;
