import urlJoin from 'url-join';
import fetch from 'node-fetch';
import waitForExpect from 'wait-for-expect';
import { SignJWT, importJWK } from 'jose';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData, initializeAppServer } from './initialize.ts';
import ExampleAppService from './apps/example3.app.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(120000);

const INTEROP = 'http://www.w3.org/ns/solid/interop#';
const APP_URI = 'http://localhost:3001/app';
const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');

describe('Applications registered on a group, used by its members', () => {
  let podProvider: any,
    appServer: any,
    alice: any,
    bob: any,
    craig: any,
    groupWebId: string,
    containerUri: string,
    eventUri: string;

  const call = (actor: any, actionName: string, params: any = {}) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id, dataset: actor.preferredUsername } });

  const getRoleUri = (role: string) => podProvider.call('role-registrations.getUri', { groupWebId, role });

  const fetchWithApp = async (actor: any, url: string) => {
    const { privateJwk } = await podProvider.call('jwk.get');
    const token = await new SignJWT({ webid: actor.id, azp: APP_URI })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importJWK(privateJwk, 'ES256'));
    return fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: MIME_TYPES.JSON } });
  };

  const getAppGrants = async (actor: any) => {
    const container = await call(actor, 'delegated-access-grants.list', {
      filters: {
        [`${INTEROP}grantee`]: APP_URI,
        [`${INTEROP}dataOwner`]: groupWebId,
        [`${INTEROP}hasDataRegistration`]: containerUri
      },
      webId: actor.id
    });
    return arrayOf(container['ldp:contains']);
  };

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    const actors = [];
    for (let i = 1; i <= 3; i++) {
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
    [alice, bob, craig] = actors;

    await call(alice, 'groups.create', { id: 'acme', type: 'foaf:Organization' });
    groupWebId = urlJoin(new URL(alice.id).origin, 'acme');

    // Alice registers the app on the group
    await call(alice, 'registration-endpoint.register', {
      appUri: APP_URI,
      podOwner: groupWebId,
      acceptAllRequirements: true
    });

    containerUri = await podProvider.call('data-registrations.getByShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId
    });
    eventUri = await podProvider.call(
      'ldp.container.post',
      {
        containerUri,
        resource: { type: OBJECT_TYPES.EVENT, name: 'General assembly' },
        contentType: MIME_TYPES.JSON,
        webId: groupWebId
      },
      { meta: { webId: groupWebId, dataset: 'acme' } }
    );

    await podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: await getRoleUri('member'),
      agentUri: bob.id
    });
  }, 120000);

  afterAll(async () => {
    await appServer.stop();
    await podProvider.stop();
  });

  test('A member who did not register the app cannot use it on the group', async () => {
    const res = await fetchWithApp(bob, eventUri);
    expect(res.status).toBe(403);
  });

  test('A member registers the app for the group', async () => {
    await call(bob, 'registration-endpoint.register', { appUri: APP_URI, storages: [groupWebId] });

    await expect(
      call(bob, 'app-registrations.getForAgent', { agentUri: APP_URI, podOwner: bob.id })
    ).resolves.toMatchObject({ 'interop:registeredBy': bob.id });

    // The app only gets access to the data of the group
    const authorizations = await call(bob, 'access-authorizations.listByGrantee', { grantee: APP_URI, webId: bob.id });
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0]).toMatchObject({
      'interop:scopeOfAuthorization': 'interop:AllFromRegistry',
      'interop:dataOwner': groupWebId,
      'interop:hasDataRegistration': containerUri
    });

    // Bob's role has no access to the events yet
    await expect(getAppGrants(bob)).resolves.toHaveLength(0);
  });

  test('The app gets access when the role of the member is given access', async () => {
    await podProvider.call(
      'access-authorizations.addForShapeTree',
      {
        shapeTreeUri: EVENT_SHAPE_TREE,
        grantee: await getRoleUri('member'),
        accessModes: ['acl:Read', 'acl:Write'],
        webId: groupWebId
      },
      { meta: { webId: groupWebId, dataset: 'acme' } }
    );

    await waitForExpect(async () => {
      const grants = await getAppGrants(bob);
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatchObject({ 'interop:grantedBy': bob.id, 'interop:scopeOfGrant': 'interop:AllFromRegistry' });
    });

    const res = await fetchWithApp(bob, eventUri);
    expect(res.status).toBe(200);
  });

  test('A non-member cannot register the app for the group', async () => {
    await expect(
      call(craig, 'registration-endpoint.register', { appUri: APP_URI, storages: [groupWebId] })
    ).rejects.toMatchObject({ code: 403 });
  });
});
