import { ServiceBroker } from 'moleculer';
import { connectPodProvider, clearAllData, initializeAppServer, installApp, createAccount } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import Example2AppService from './apps/example2.app.ts';

jest.setTimeout(100000);

describe('Test Pod WAC groups handling', () => {
  let podProvider: ServiceBroker, alice: any, app: any, app2: any;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    app = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    app2 = await initializeAppServer(3002, 'app2', 'app2_settings', 2, Example2AppService);

    alice = await createAccount(podProvider, 'alice');

    await installApp(alice, app.id);
    await installApp(alice, app2.id);
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
    await app.stop();
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
