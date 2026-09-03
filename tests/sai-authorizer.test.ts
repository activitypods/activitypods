import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { OBJECT_TYPES } from '@semapps/activitypub';
import {
  connectPodProvider,
  clearAllData,
  createTestActor,
  initializeAppServer,
  installApp,
  getTestApp
} from './initialize.ts';
import ExampleAppService from './apps/example3.app.ts';
import * as CONFIG from './config.ts';
import { TestActor, TestApp } from './utilTypes.js';

jest.setTimeout(120000);

describe('Test SAI authorizer', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    app: TestApp,
    alice: TestActor,
    bob: TestActor,
    craig: TestActor,
    eventContainerUri: string,
    eventUri: string;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    await appServer.start();
    app = await getTestApp(appServer);

    alice = await createTestActor(podProvider, 'alice');
    bob = await createTestActor(podProvider, 'bob');
    craig = await createTestActor(podProvider, 'craig');
  });

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Unregistered app has no access to Alice events', async () => {
    // Create container manually since the app is not registered yet
    eventContainerUri = await alice.call('data-registrations.generateFromShapeTree', {
      shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      podOwner: alice.id
    });

    eventUri = await alice.call('ldp.container.post', {
      containerUri: eventContainerUri,
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!'
      }
    });

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventContainerUri,
        type: 'container',
        mode: 'acl:Read',
        webId: app.id
      })
    ).resolves.toBeUndefined();

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: app.id
      })
    ).resolves.toBeUndefined();
  });

  test('Registered app has access on all Alice events', async () => {
    await installApp(alice, app.id);

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('sai.authorizer.hasPermission', {
          uri: eventContainerUri,
          type: 'container',
          mode: 'acl:Read',
          webId: app.id
        })
      ).resolves.toBeTruthy();
    });

    // Giving acl:Write also give acl:Append permission
    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventContainerUri,
        type: 'container',
        mode: 'acl:Append',
        webId: app.id
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: app.id
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: app.id
      })
    ).resolves.toBeTruthy();
  });

  test('Bob has no permissions on Alice event', async () => {
    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: bob.id
      })
    ).resolves.toBeUndefined();
  });

  test('Alice gives read access to Bob', async () => {
    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    await expect(
      bob.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: bob.id
      })
    ).resolves.toBeTruthy();

    await expect(
      bob.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: bob.id
      })
    ).resolves.toBeUndefined();
  });

  // Check the authorizer also handle correctly delegated grants
  test('Bob gives read access to Craig', async () => {
    // It takes a little longer for the new access grant to be attached to the container
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('access-authorizations.addForSingleResource', {
          resourceUri: eventUri,
          grantee: craig.id,
          accessModes: ['acl:Read']
        })
      ).resolves.not.toThrow('You are not allowed to share this resource');
    });

    await expect(
      craig.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: craig.id
      })
    ).resolves.toBeTruthy();

    await expect(
      craig.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: craig.id
      })
    ).resolves.toBeUndefined();
  });
});
