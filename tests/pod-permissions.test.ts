import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import {
  connectPodProvider,
  clearAllData,
  initializeAppServer,
  installApp,
  createTestActor,
  getTestApp
} from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import Example2AppService from './apps/example2.app.ts';
import { TestActor, TestApp } from './utilTypes.js';

jest.setTimeout(100000);

describe('Test Pod resources handling', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    app2Server: ServiceBroker,
    alice: TestActor,
    app: TestApp,
    app2: TestApp,
    eventUri: string,
    aliceEventsContainerUri: string;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    alice = await createTestActor(podProvider, 'alice');

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    await appServer.start();
    app = await getTestApp(appServer);

    app2Server = await initializeAppServer(3002, 'app2', 'app2_settings', 2, Example2AppService);
    await app2Server.start();
    app2 = await getTestApp(app2Server);

    await installApp(alice, app.id);
    await installApp(alice, app2.id);
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
    await app2Server.stop();
  });

  test('Add permission with acl:Control permission', async () => {
    aliceEventsContainerUri = await alice.getContainerUri('as:Event');

    eventUri = await alice.call('ldp.container.post', {
      containerUri: aliceEventsContainerUri,
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      }
    });

    await expect(
      app.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/bob',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      app.call('pod-permissions.get', {
        uri: eventUri,
        actorUri: alice.id
      })
    ).resolves.toContainEqual(
      expect.objectContaining({
        '@type': 'acl:Authorization',
        'acl:accessTo': eventUri,
        'acl:agent': 'http://localhost:3000/bob',
        'acl:mode': 'acl:Read'
      })
    );
  });

  test('Add permission without acl:Control permission', async () => {
    await expect(
      app2.call('pod-permissions.add', {
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
      app.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      app.call('pod-permissions.remove', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      app.call('pod-permissions.get', {
        uri: eventUri,
        actorUri: alice.id
      })
    ).resolves.toContainEqual(
      expect.objectContaining({
        '@type': 'acl:Authorization',
        'acl:accessTo': eventUri,
        'acl:agent': 'http://localhost:3000/bob',
        'acl:mode': 'acl:Read'
      })
    );
  });
});
