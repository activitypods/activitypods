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

describe('Test Pod WAC groups handling', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    app2Server: ServiceBroker,
    alice: TestActor,
    app: TestApp,
    app2: TestApp;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    await appServer.start();
    app = await getTestApp(appServer);

    app2Server = await initializeAppServer(3002, 'app2', 'app2_settings', 2, Example2AppService);
    await app2Server.start();
    app2 = await getTestApp(app2Server);

    alice = await createTestActor(podProvider, 'alice');

    await installApp(alice, app.id);
    await installApp(alice, app2.id);
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
    await app2Server.stop();
  });

  test('Create WAC group with apods:CreateWacGroup permission', async () => {
    await expect(
      app.call('pod-wac-groups.create', {
        groupSlug: 'my-group',
        actorUri: alice.id
      })
    ).resolves.toBe('http://localhost:3000/_groups/alice/my-group');

    await expect(
      app.call('pod-wac-groups.get', {
        groupSlug: 'my-group',
        actorUri: alice.id
      })
    ).resolves.toHaveLength(0);

    await expect(
      app.call('pod-wac-groups.list', {
        actorUri: alice.id
      })
    ).resolves.toContain('http://localhost:3000/_groups/alice/my-group');
  });

  test('Add permission without apods:CreateWacGroup permission', async () => {
    await expect(
      app2.call('pod-wac-groups.create', {
        groupSlug: 'my-other-group',
        actorUri: alice.id
      })
    ).resolves.toBeFalsy();
  });

  test('Add members to WAC group', async () => {
    await expect(
      app.call('pod-wac-groups.addMember', {
        groupSlug: 'my-group',
        memberUri: 'http://localhost:3000/bob',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      app.call('pod-wac-groups.get', {
        groupSlug: 'my-group',
        actorUri: alice.id
      })
    ).resolves.toContain('http://localhost:3000/bob');
  });

  test('Remove members from WAC group', async () => {
    await expect(
      app.call('pod-wac-groups.removeMember', {
        groupSlug: 'my-group',
        memberUri: 'http://localhost:3000/bob',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      app.call('pod-wac-groups.get', {
        groupSlug: 'my-group',
        actorUri: alice.id
      })
    ).resolves.toHaveLength(0);
  });

  test('Delete WAC group', async () => {
    await expect(
      app.call('pod-wac-groups.delete', {
        groupSlug: 'my-group',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    await expect(
      app.call('pod-wac-groups.get', {
        groupSlug: 'my-group',
        actorUri: alice.id
      })
    ).resolves.toBeFalsy();
  });
});
