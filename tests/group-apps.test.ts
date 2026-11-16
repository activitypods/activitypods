import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
import ExampleAppService from './apps/example3.app.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(120000);

const INTEROP = 'http://www.w3.org/ns/solid/interop#';
const APP_URI = 'http://localhost:3001/app';
const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');

describe('Test the access of the applications of the members to the data of a group', () => {
  let podProvider: any,
    appServer: any,
    alice: any,
    bob: any,
    groupWebId: string,
    containerUri: string,
    eventUri: string;

  const call = (actor: any, actionName: string, params: any = {}) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id, dataset: actor.preferredUsername } });

  const callAsGroup = (actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: groupWebId, dataset: 'acme' } });

  const getRoleUri = (role: string) => podProvider.call('role-registrations.getUri', { groupWebId, role });

  const getAppGrants = async () => {
    const container = await call(bob, 'delegated-access-grants.list', {
      filters: {
        [`${INTEROP}grantee`]: APP_URI,
        [`${INTEROP}dataOwner`]: groupWebId,
        [`${INTEROP}hasDataRegistration`]: containerUri
      },
      webId: bob.id
    });
    return arrayOf(container['ldp:contains']);
  };

  const appRights = (rights: any) =>
    podProvider.call('webacl.resource.hasRights', { resourceUri: eventUri, rights, webId: APP_URI });

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    const actors = [];
    for (let i = 1; i <= 2; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors.push(
        await podProvider.call(
          'activitypub.actor.awaitCreateComplete',
          { actorUri: webId },
          { meta: { dataset: actorData.username } }
        )
      );
    }
    [alice, bob] = actors;

    // The application asks access to all the events of Bob
    await installApp({ ...bob, call: (actionName: string, params: any) => call(bob, actionName, params) }, APP_URI);

    await call(alice, 'groups.create', { id: 'acme', type: 'foaf:Organization' });
    groupWebId = urlJoin(new URL(alice.id).origin, 'acme');
    await podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: await getRoleUri('member'),
      agentUri: bob.id
    });

    containerUri = await callAsGroup('data-registrations.generateFromShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId
    });
    eventUri = await callAsGroup('ldp.container.post', {
      containerUri,
      resource: { type: OBJECT_TYPES.EVENT, name: 'General assembly' },
      contentType: MIME_TYPES.JSON,
      webId: groupWebId
    });
  }, 120000);

  afterAll(async () => {
    await appServer.stop();
    await podProvider.stop();
  });

  test('The application of a member gets access to the data shared with a role', async () => {
    await callAsGroup('access-authorizations.addForShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      grantee: await getRoleUri('member'),
      accessModes: ['acl:Read'],
      webId: groupWebId
    });

    await waitForExpect(async () => {
      const grants = await getAppGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({
        'interop:grantedBy': bob.id,
        'interop:scopeOfGrant': 'interop:AllFromRegistry',
        'interop:accessMode': 'acl:Read'
      });
    });

    await waitForExpect(async () => {
      await expect(appRights({ read: true, write: true })).resolves.toMatchObject({ read: true, write: false });
    });
  });

  test('The application loses the access when the member leaves the role', async () => {
    await podProvider.call('role-registrations.removeMember', {
      roleRegistrationUri: await getRoleUri('member'),
      agentUri: bob.id
    });

    await waitForExpect(async () => {
      await expect(getAppGrants()).resolves.toHaveLength(0);
    });
    await waitForExpect(async () => {
      await expect(appRights({ read: true })).resolves.toMatchObject({ read: false });
    });
  });

  test('The application of an admin gets full access to the data of the group', async () => {
    await podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: await getRoleUri('admin'),
      agentUri: bob.id
    });

    await waitForExpect(async () => {
      const grants = await getAppGrants();
      expect(grants.map((grant: any) => arrayOf(grant['interop:accessMode']).sort())).toContainEqual([
        'acl:Read',
        'acl:Write'
      ]);
    });

    await waitForExpect(async () => {
      await expect(appRights({ read: true, write: true })).resolves.toMatchObject({ read: true, write: true });
    });
  });
});
