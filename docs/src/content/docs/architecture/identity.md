---
title: Identity
sidebar:
  order: 2
---

## WebID

All ActivityPub actors are also WebIDs.

```json
{
  "@context": "https://activitypods.org/context.json",
  "id": "https://mypod.store/alice",
  "type": ["foaf:Person", "Person"],
  "dc:created": "2023-01-13T11:42:45.636Z",
  "dc:modified": "2023-01-13T11:42:48.389Z",
  "foaf:nick": "alice",
  "preferredUsername": "alice",
  "inbox": "https://mypod.store/alice/inbox",
  "outbox": "https://mypod.store/alice/outbox",
  "followers": "https://mypod.store/alice/followers",
  "following": "https://mypod.store/alice/following",
  "liked": "https://mypod.store/alice/liked",
  "publicKey": {
    "owner": "https://mypod.store/alice",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAzlq6avqA4nwxGDqXMijZ\nixRIllyIDkF4rc9KxUHizysOJEBx9+WSfom0wlS1hPr+Qn90eb8h/8wjbvfXdjYm\npdusaTOrRMFEEMX4lquAPcgLxZKzQNAy8zUw/oBpnrep52Hmx7VfYFfCpAP7OxAL\nsA4mdKq1tx2e0g9so+5WeAa3yiKCvqkE6QJQXgk+WQ998aQg133HOUOqa1JKaU0k\nJK6fVYnJ74L7b6OWQDbehu0SBlAAypOJzkO4WysKOGiUCrrcgol2LmTImzCoTZS3\nPUUV0Rh2iI3v5t07vUfr5o415Em5YFwoPRhq3WH6hmP7wd9ducaFNl9Q/XyYQmPK\nG1F3RQNwtSy6aeAUajw6HTWd+FlFA6oA9LLaVxCoTxlejLB8IrYo3y2PGxPAXNl3\nqodsXWk/I/Jm/nus+RLVGCoJLl+i+zzEF0WG20+rfb0cNPjzuzgWuYY2PTBu78Ib\nizaXLv23fPLmxxUwHQgcCc4RgbmBAwhLWTsGETRLbDSWwBZnkv6PnMVlyrzs47jf\nr+vFYIxdiz8VvJe+sQ7hSrkzVjCluKIXhWT3bPtOkq4fepTnZmGi3qXRCg5cacd8\ni+KLaGtsHIsNyGOGfi55S5ZiSMo7kbeUxfM6xFjfhWuj3jDmMYfYQgBSmP2CNcEU\nTWmx7zJiaO3Me1q3sFG8Ti0CAwEAAQ==\n-----END PUBLIC KEY-----\n"
  },
  "endpoints": {
    "void:sparqlEndpoint": "https://mypod.store/alice/sparql",
    "proxyUrl": "https://mypod.store/alice/proxy"
  },
  "url": "https://mypod.store/alice/data/profiles/63c143b75ea9720d1b484a39"
}
```

Some Solid predicates are still missing ([#122](https://github.com/assemblee-virtuelle/activitypods/issues/122))
