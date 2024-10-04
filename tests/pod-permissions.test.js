const urlJoin = require('url-join');
const { MIME_TYPES } = require('@semapps/mime-types');
const { connectPodProvider, clearAllData, initializeAppServer, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example.app');
const Example2AppService = require('./apps/example2.app');

jest.setTimeout(100000);

const NUM_PODS = 1;

const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

const APP2_SERVER_BASE_URL = 'http://localhost:3002';
const APP2_URI = urlJoin(APP2_SERVER_BASE_URL, 'app');

describe('Test Pod resources handling', () => {
  let actors = [],
    podProvider,
    alice,
    appServer,
    app2Server,
    eventUri;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    app2Server = await initializeAppServer(3002, 'app2Data', 'app2_settings', 2, Example2AppService);
    await app2Server.start();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];

    await installApp(alice, APP_URI);
    await installApp(alice, APP2_URI);
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Add permission with acl:Control permission', async () => {
    eventUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/event'),
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      },
      contentType: MIME_TYPES.JSON
    });

    await expect(
      appServer.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/bob',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      appServer.call('pod-permissions.get', {
        uri: eventUri,
        actorUri: alice.id
      })
    ).resolves.toContainEqual(
      expect.objectContaining({
        '@id': '#Read',
        '@type': 'acl:Authorization',
        'acl:accessTo': eventUri,
        'acl:agent': 'http://localhost:3000/bob',
        'acl:mode': 'acl:Read'
      })
    );
  });

  test('Add permission without acl:Control permission', async () => {
    await expect(
      app2Server.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeFalsy();
  });

  test('Remove permission', async () => {
    await expect(
      appServer.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      appServer.call('pod-permissions.remove', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      appServer.call('pod-permissions.get', {
        uri: eventUri,
        actorUri: alice.id
      })
    ).resolves.toContainEqual(
      expect.objectContaining({
        '@id': '#Read',
        '@type': 'acl:Authorization',
        'acl:accessTo': eventUri,
        'acl:agent': 'http://localhost:3000/bob',
        'acl:mode': 'acl:Read'
      })
    );
  });
});
