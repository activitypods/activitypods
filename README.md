[![SemApps](https://badgen.net/badge/Powered%20by/SemApps/28CDFB)](https://semapps.org) [![Chat](https://badgen.net/badge/chat/on%20rocket.chat/orange)](https://chat.lescommuns.org/channel/activitypods)

![activitypods-small](https://user-images.githubusercontent.com/17931931/215525902-6ae72fa9-fde0-43eb-a053-0ccfd4565ead.png)

# ActivityPods

Check out [our website](https://activitypods.org) or [these slides](./proposal/proposal-english.pdf) ([french version](./proposal/proposal-french.pdf)) for more information about this project !

> Note: the next version of ActivityPods, currently in alpha stage, is available in the [next](https://github.com/assemblee-virtuelle/activitypods/tree/next) branch.

### Frontends using ActivityPods

- [Welcome To My Place](https://github.com/assemblee-virtuelle/welcometomyplace) ([french version](https://bienvenuechezmoi.org))
- [Mutual Aid](https://github.com/assemblee-virtuelle/mutual-aid.app) ([french version](https://lentraide.app))

### Pods providers

- [MyPod.store](https://mypod.store) (English)
- [Armoise.co](https://armoise.co) (French, Oise area)
- [Bocage.me](https://bocage.me) (French, Normandy area)

### Available bots

- [Profiles](packages/profiles/README.md)
- [Contacts](packages/contacts/README.md)
- [Messages](packages/messages/README.md)
- [Events](packages/events/README.md)
- [Marketplace](packages/marketplace)

### Utilities

- [Announcer](packages/announcer/README.md)

## Getting started

### Launch the triple store

```bash
docker-compose up -d fuseki
```

### Bootstrap (installs frontend and backend)

```bash
yarn install
```

### Launch the backend

```bash
cd backend
yarn run dev
```

### Launch the frontend

```bash
cd frontend
yarn start
```

## Quick guide

### Create an actor with a POD

```
POST /auth/signup HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
    "name": "Alice",
    "username": "alice",
    "email": "alice@test.com",
    "password": "test"
}
```

This will create an ActivityPub actor on http://localhost:3000/alice (viewable by everyone) and a Solid POD on http://localhost:3000/alice/data.

You will receive in return a JWT token to authenticate the newly-created user on subsequent requests.

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "webId": "http://localhost:3000/alice",
  "newUser": true
}
```

> If you need to login again with the same user, you can use the `/auth/login` endpoint with the username and password.

### Post a resource in a container

Upon actor creation, several LDP containers have been automatically created on the http://localhost:3000/alice/data POD: `/profiles`, `/events`, `/places`.

You can now post an event on the `/events` container, following the [LDP specification](https://www.w3.org/TR/ldp-primer/).

```
POST /alice/data/events HTTP/1.1
Host: localhost:3000
Content-Type: application/ld+json
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

{
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Event",
    "name": "Birthday party !"
}
```

The URL of the newly-created event will be returned in the `Location` header of the response.

```
Location: http://localhost:3000/alice/data/events/61a0f897e5b88b06f85b1190
Link: <http://www.w3.org/ns/ldp#Resource>; rel="type"
```

> By default, this event is only visible by yourself (you can do a `GET` with the JWT token).

### Post an activity in the outbox

The created actor has everything needed to exchange with other ActivityPub actors.

You can announce the new event using the ActivityPub outbox:

```
POST /alice/outbox HTTP/1.1
Host: localhost:3000
Content-Type: application/ld+json
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

{
    "@context": "https://www.w3.org/ns/activitystreams",
    "type": "Announce",
    "actor": "http://localhost:3000/alice",
    "object": "http://localhost:3000/alice/data/events/61a0f897e5b88b06f85b1190",
    "to": "https://www.w3.org/ns/activitystreams#Public"
}
```

Since this activity is public, anyone will be able to view it on the outbox. But you could of course have sent it only to selected users, in which case it will have been sent to their inboxes.

```
GET /alice/outbox?page=1 HTTP/1.1
Host: localhost:3000
Accept: application/ld+json

{
    "@context": "http://localhost:3000/_system/context.json",
    "id": "http://localhost:3000/alice/outbox?page=1",
    "type": "OrderedCollectionPage",
    "partOf": "http://localhost:3000/alice/outbox",
    "orderedItems": [{
        "id": "http://localhost:3000/alice/data/activities/61b72a9cc7ff2f4bbb85606b",
        "type": "Announce",
        "actor": "http://localhost:3000/alice",
        "object": "http://localhost:3000/alice/data/events/61a0f897e5b88b06f85b1190",
        "published": "2021-12-13T11:12:28.943Z",
        "to": "as:Public"
    }],
    "totalItems": 1
}
```

## Linking to SemApps packages

To modify packages on the [SemApps repository](https://github.com/assemblee-virtuelle/semapps) and see the changes before they are published on NPM, see the following instructions.

### Linking backend packages

To link backend packages, you can use [`yarn link`](https://classic.yarnpkg.com/en/docs/cli/link/).

```bash
cd /SEMAPPS_REPO/src/middleware
yarn run link-all
cd /ACTIVITYPODS_REPO
yarn run link-semapps-packages
```

### Linking frontend packages

Linking frontend packages with `yarn link` doesn't work because it causes version mismatch errors for React and MUI (see [this PR](https://github.com/assemblee-virtuelle/semapps/pull/1180) for explainations). So you should use [Yalc](https://github.com/wclr/yalc) instead. Fortunately, we make it easy for you.

```bash
cd /SEMAPPS_REPO/src/frontend
yarn run yalc:publish
cd /ACTIVITYPODS_REPO/frontend
yarn run link-semapps-packages
```

Additionally, frontend packages need to be rebuilt on every changes, or they will not be taken into account by ActivityPods. You can use `yarn run build` to build a package once, or `yarn run watch` to rebuild a package on every change. On every build, the new package will be published to Yalc.

Thanks to git hooks, the frontend packages will also be published to Yalc whenever git branches are changed.

## Deployment to production

Follow the guide [here](deploy/README.md).

## Integration tests

```bash
yarn install
docker-compose up -d fuseki_test
cd tests
yarn run test
```

## Funding

This project is funded through the [NGI0 Entrust Fund](https://nlnet.nl/entrust), a fund
established by [NLnet](https://nlnet.nl) with financial support from the European Commission's
[Next Generation Internet](https://ngi.eu) program, under the aegis of DG Communications Networks,
Content and Technology under grant agreement No 101069594. Learn more on the [NLnet project page](https://nlnet.nl/project/ActivityPods).

[<img src="https://nlnet.nl/logo/banner.png" alt="NLNet foundation logo" width="300" />](https://nlnet.nl/)
[<img src="https://nlnet.nl/image/logos/NGI0Entrust_tag.svg" alt="NGI Zero Entrust Logo" width="300" />](https://nlnet.nl/)
