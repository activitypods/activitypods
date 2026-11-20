import { arrayOf, fetchJson, fetchWithSession } from './utils';
import { AuthSession, NotificationActivity, UnwatchFn } from './types';

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

export const objectId = (object: NotificationActivity['object']): string | undefined => {
  if (!object) return undefined;
  return typeof object === 'string' ? object : object.id || object['@id'];
};

/**
 * Open a [Solid Notifications](https://solidproject.org/TR/notifications-protocol) WebSocket
 * subscription for a single `topic` (a resource or a container URI), and call `onActivity` for
 * every activity the Pod sends over it. Resolves once the channel is created and the socket is open.
 */
export const subscribeToTopic = async (
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
