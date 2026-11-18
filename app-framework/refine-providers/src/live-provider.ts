import type { LiveEvent, LiveProvider } from '@refinedev/core';
import { arrayOf, DEFAULT_CONTEXT, fetchJson, fetchWithSession } from './utils';
import { storagesResolver } from './storages';
import { AuthSession, LiveProviderConfig, NotificationActivity, ResourceConfig, UnwatchFn } from './types';

const ACTIVITY_TYPE_MAP: Record<string, LiveEvent['type']> = {
  Create: 'created',
  Add: 'created',
  Update: 'updated',
  Delete: 'deleted',
  Remove: 'deleted'
};

// The WebSocketChannel2023 subscription endpoint is the same for every Pod on a given origin
// (advertised on `.well-known/solid`), so it only needs to be discovered once per origin.
const subscriptionEndpointCache = new Map<string, Promise<string>>();

const discoverSubscriptionEndpoint = (origin: string): Promise<string> => {
  if (!subscriptionEndpointCache.has(origin)) {
    const promise = (async () => {
      const { json } = await fetchJson(`${origin}/.well-known/solid`);
      const endpoint = arrayOf<string>(json['notify:subscription']).find(uri => uri.includes('WebSocketChannel2023'));
      if (!endpoint) {
        throw new Error(`No WebSocketChannel2023 subscription endpoint advertised at ${origin}/.well-known/solid`);
      }
      return endpoint;
    })();
    promise.catch(() => subscriptionEndpointCache.delete(origin));
    subscriptionEndpointCache.set(origin, promise);
  }
  return subscriptionEndpointCache.get(origin)!;
};

const objectId = (object: NotificationActivity['object']): string | undefined => {
  if (!object) return undefined;
  return typeof object === 'string' ? object : object.id || object['@id'];
};

/**
 * Open a [Solid Notifications](https://solidproject.org/TR/notifications-protocol) WebSocket
 * subscription for a single `topic` (a resource or a container URI), and call `onActivity` for
 * every activity the Pod sends over it. Resolves once the channel is created and the socket is open.
 */
const subscribeToTopic = async (
  topic: string,
  session: AuthSession,
  onActivity: (activity: NotificationActivity) => void
): Promise<UnwatchFn> => {
  const endpoint = await discoverSubscriptionEndpoint(new URL(topic).origin);

  // Topics on other servers are subscribed through the user's Pod proxy
  const { json: channel } = await fetchWithSession(
    endpoint,
    {
      method: 'POST',
      body: JSON.stringify({
        '@context': { notify: 'http://www.w3.org/ns/solid/notifications#' },
        '@type': 'notify:WebSocketChannel2023',
        'notify:topic': topic
      })
    },
    session
  );

  const receiveFrom: string | undefined = channel['notify:receiveFrom'];
  if (!receiveFrom) {
    throw new Error(`The Pod did not return a notify:receiveFrom URL when subscribing to ${topic}`);
  }

  const socket = new WebSocket(receiveFrom);
  socket.addEventListener('message', event => {
    try {
      onActivity(JSON.parse(event.data));
    } catch {
      // Ignore malformed / non-JSON messages
    }
  });

  return () => {
    socket.close();
    const channelUri = channel.id || channel['@id'];
    if (channelUri) {
      // Best effort: unsubscribing is a courtesy, the channel will also expire server-side.
      fetchWithSession(channelUri, { method: 'DELETE' }, session).catch(() => undefined);
    }
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

      const { containers } = await resolveListSources(resourceId, session);
      const results = await Promise.allSettled(
        containers.map(({ uri }) =>
          subscribeToTopic(uri, session, activity => {
            const type = ACTIVITY_TYPE_MAP[activity.type];
            const id = objectId(activity.object);
            if (type && id) emit(type, [id], new Date(activity.published ?? Date.now()));
          })
        )
      );
      const unwatchFns: UnwatchFn[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') unwatchFns.push(result.value);
        else console.warn(`Could not watch ${containers[i].uri}`, result.reason);
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
