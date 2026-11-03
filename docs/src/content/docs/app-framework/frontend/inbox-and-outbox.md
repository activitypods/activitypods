---
title: Inbox & outbox
sidebar:
  order: 3
---

## Reading collections

The `useCollection` hook of `@activitypods/refine-hooks` fetches an ActivityPub collection. You can pass its URI, or a predicate of the user's WebID such as `inbox`, `outbox` or `apods:contacts`. Collections hosted on other servers are fetched through the user's Pod proxy.

```tsx
import { useCollection } from '@activitypods/refine-hooks';

export const InboxPage = () => {
  const { items: activities, hasNextPage, fetchNextPage } = useCollection('inbox');
  return (
    <>
      {activities.map(activity => (
        <div key={activity.id}>
          <h2>Activity type: {activity.type}</h2>
          <p>{activity.content}</p>
        </div>
      ))}
      {hasNextPage && <button onClick={() => fetchNextPage()}>Fetch more activities</button>}
    </>
  );
};
```

Items are returned as they are in the collection: either URIs, or objects for embedded items. The hook also returns `addItem` and `removeItem` to update the collection optimistically, while your backend processes an activity.

## Posting to the outbox

```tsx
import { useOutbox } from '@activitypods/refine-hooks';

export const FollowButton = ({ actorUri }) => {
  const outbox = useOutbox();

  const follow = () =>
    outbox.post({
      type: 'Follow',
      actor: outbox.owner,
      object: actorUri,
      to: actorUri
    });

  return <button onClick={follow}>Follow</button>;
};
```

`post` returns the URI of the created activity. Activities are sent with the ActivityStreams context, or with the `jsonContext` passed to `useOutbox`.
