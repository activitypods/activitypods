---
title: Inbox & outbox
sidebar:
  order: 3
---

## Fetching the inbox and outbox

SemApps [`useCollection`](https://semapps.org/docs/frontend/activitypub-components#usecollection) hook make it easy to fetch the content of the inbox or outbox.

Note that if you pass only "inbox" or "outbox", it will fetch the collections of the logged user. Otherwise you may pass the URI of any actor's inbox or outbox to read them.

```js
import { useCollection } from '@semapps/activitypub-components';

export const InboxPage = () => {
  const { items: activities, hasNextPage, fetchNextPage } = useCollection('inbox');
  return (
    <>
      {activities?.map(activity => (
        <div>
          <h2>Activity Type: {activity.type}</h2>
          <p>{activity.content}</p>
        </div>
      ))}
      {hasNextPage && <button onClick={fetchNextPage}>Fetch more activities</button>}
    </>
  );
};
```

## Posting to the outbox

```js
import { useOutbox } from '@semapps/activitypub-components';

export const MyPage = props => {
  const outbox = useOutbox();

  const follow = actorUrl => {
    outbox.post({
      type: 'Follow',
      actor: outbox.owner,
      object: actorUrl,
      to: actorUrl
    });
  };

  return <button onClick={() => follow('http://localhost:3000/alice')}>Follow Alice</button>;
};
```
