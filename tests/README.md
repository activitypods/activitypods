# Integration tests

This directory contains code to automatically test ActivityPods' [Pod provider](../pod-provider/), as well as its [app framework](../app-framework/).

## Launch the Pod provider

Before running the tests, you need to launch the Pod provider, as well as various tools such as Jena Fuseki, Redis and Mailcatcher. The tests will run in an independent process and connect to the Pod provider [thanks to Moleculer networking abilities](https://moleculer.services/docs/0.14/networking). You will be able to interact with the ServiceBroker of the Pod provider, call any services, etc.

There are two methods for launching the Pod provider for tests:

### 1. Directly on the local machine

Call `make start-test` from the `/pod-provider` directory to start all Docker containers, except the Pod provider container.

Call `yarn run test` from the `/pod-provider/backend` directory. This will use the `.env.test` file to start the Pod provider with the Jena Fuseki and Redis dataset (it is not the same one as if you run `yarn run dev`)

Advantages:

- You can keep the symlinks created by `yarn link` if you modify SemApps packages
- You can more easily add debug breakpoints if you want to see what's going on

Disadvantages:

- The /uploads directory will be filled with test data (TODO: delete them when we delete users Pods)

### 2. In a Docker container

Call `make start-test-with-pod-provider` from the `/pod-provider` directory to start all Docker containers, including the Pod provider container.

The Pod provider will be rebuilt (`yarn install` will be run only if the package.json file has been modified)

Advantages:

- We have clean data, no interference with possible local dev data
- We will be able to automate this with GitHub actions

Disadvantages:

- You must restart the container when you do changes to the Pod provider code
- Keeping symlinks is not possible, so you won't be able to modify SemApps packages and link them.
  - It may be possible with Yalc (which is already used on the SemApps frontend components)

## Install packages

```bash
cd tests
yarn install
```

If you made changes to SemApps packages, you can run this command to link them:

```bash
yarn run link-semapps-packages
```

## Run the tests

You are now ready to run the tests, either individually or all together.

### With the command line

```bash
yarn run test // Run all test suites
yarn run test pod- // Run all test suites starting with pod-
yarn run test contacts.test.js // Run a specific test suite
```

Note that running all tests suites at the same time sometimes generate errors that are not present when we run them one-by-one. We will work to improve this.

### With VS code

We have configured the `launch.json` configuration file so that you can run tests with a single command, and it will do that in Debug mode.

Just open the test suite you want to run, and press F5.

## Data visualization tools

There are several tools that can help to explore the data that are produced during the tests. These data are cleared at the beginning of every test suites, but not at the end. So if you run a single test suite, all data will be here.

- Jena Fuseki: Go to http://localhost:3040 and you will be able to explore the various datasets.
- Mailcatcher: Go to http://localhost:1080 and you will see the mails that have been set
- Arena: Go to http://localhost:4567 and you will see the jobs that have been run. Of particular interest are the jobs in the `processInbox` and `processOutbox` which lets you see the various activities that have been sent and received.

Finally, you can have a look at the log produced by the Pod provider.

## Restrictions

- You should consider the Pod provider as a whole software to play with. You can, in theory, add other services, destroy services, but we don't recommend it as it may have unwanted effects on other tests (in that case, you should probably stop and restart the ServiceBroker)
- Before running any test suite, Jest will clear all Jena Fuseki datasets, Redis databases, but it will not restart the PodProvider to increase speed. So you should avoid keeping information in memory (with the `this` variable) as it will not be cleared on the next.
  - To increase performance, prefer to use the builtin [Moleculer caching features](https://moleculer.services/docs/0.14/caching), which is not activated by default on tests.
  - If you cannot do without this in-memory information, you can create an action (eg. `clearCache`) and call it from within the `connectPodProvider` function just after the broker start.
- To communicate with the Pod provider, data are serialized as JSON and stored in a Redis database. So you cannot (inside the tests), call an action or emit an event with a function or non-serializable objects. And indeed it is a bad practice in Moleculer, even if it works for local actions and events.
  - We adapted the default JSON serializer to handle RDF.js data model classes (which are notably used in the `ldp.resource.patch` action). This could be extended for other special classes. See the RdfJSONSerializer definition for more information.
