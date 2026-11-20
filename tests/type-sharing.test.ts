import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData, createActor } from './initialize.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(100000);

const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');

describe('Test sharing all the data of a given type', () => {
  let podProvider: any,
    alice: any,
    bob: any,
    craig: any,
    aliceContainerUri: string,
    eventUri: string,
    event2Uri: string,
    craigEventUri: string,
    authorizationUri: string;

  const hasRights = async (actor: any, resourceUri: string, rights: any) =>
    podProvider.call('webacl.resource.hasRights', { resourceUri, rights, webId: actor.id });

  const createEvent = async (actor: any, containerUri: string, name: string) =>
    actor.call('ldp.container.post', {
      containerUri,
      resource: { type: OBJECT_TYPES.EVENT, name },
      contentType: MIME_TYPES.JSON
    });

  const getBobGrants = async () => {
    const container = await alice.call('access-grants.list', {
      filters: { 'http://www.w3.org/ns/solid/interop#grantee': bob.id }
    });
    return arrayOf(container['ldp:contains']);
  };

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');

    aliceContainerUri = await alice.call('data-registrations.generateFromShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: alice.id
    });
    eventUri = await createEvent(alice, aliceContainerUri, 'Birthday party');

    // Craig shares one of his events with Alice
    const craigContainerUri = await craig.call('data-registrations.generateFromShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: craig.id
    });
    craigEventUri = await createEvent(craig, craigContainerUri, 'Concert');
    await craig.call('access-authorizations.addForSingleResource', {
      resourceUri: craigEventUri,
      grantee: alice.id,
      accessModes: ['acl:Read']
    });
  });

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice shares all her events with Bob', async () => {
    authorizationUri = await alice.call('access-authorizations.addForShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      grantee: bob.id,
      accessModes: ['acl:Read']
    });

    const authorization = await alice.call('access-authorizations.get', { resourceUri: authorizationUri });
    expect(authorization).toMatchObject({
      'interop:grantee': bob.id,
      'interop:scopeOfAuthorization': 'interop:All',
      'interop:hasDataRegistration': aliceContainerUri
    });

    const grants = await getBobGrants();
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      'interop:scopeOfGrant': 'interop:AllFromRegistry',
      'interop:hasDataRegistration': aliceContainerUri
    });

    await expect(hasRights(bob, eventUri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: false
    });
  });

  test('Bob can read the events Alice creates after', async () => {
    event2Uri = await createEvent(alice, aliceContainerUri, 'Picnic');
    await expect(hasRights(bob, event2Uri, { read: true })).resolves.toMatchObject({ read: true });
  });

  test('The events shared with Alice are not shared with Bob', async () => {
    await expect(hasRights(bob, craigEventUri, { read: true })).resolves.toMatchObject({ read: false });

    const container = await craig.call('delegated-access-grants.list', {
      filters: { 'http://www.w3.org/ns/solid/interop#grantee': bob.id }
    });
    expect(arrayOf(container['ldp:contains'])).toHaveLength(0);
  });

  test('Sharing again with the same access modes keeps the authorization', async () => {
    await expect(
      alice.call('access-authorizations.addForShapeTree', {
        shapeTreeUri: EVENT_SHAPE_TREE,
        grantee: bob.id,
        accessModes: ['acl:Read']
      })
    ).resolves.toBe(authorizationUri);
  });

  test('Changing the access modes replaces the authorization and grant', async () => {
    const [oldGrant] = await getBobGrants();

    const newAuthorizationUri = await alice.call('access-authorizations.addForShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      grantee: bob.id,
      accessModes: ['acl:Read', 'acl:Write']
    });
    expect(newAuthorizationUri).not.toBe(authorizationUri);

    const grants = await getBobGrants();
    expect(grants).toHaveLength(1);
    expect(grants[0]['interop:replaces']).toBe(oldGrant.id);

    await expect(hasRights(bob, eventUri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: true
    });
  });

  test('A resource shared with Bob is kept when type is not shared anymore', async () => {
    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read']
    });
    await expect(getBobGrants()).resolves.toHaveLength(2);

    await alice.call('access-authorizations.removeForShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      grantee: bob.id
    });

    const grants = await getBobGrants();
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
      'interop:hasDataInstance': eventUri
    });

    await expect(hasRights(bob, eventUri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: false
    });
    await expect(hasRights(bob, event2Uri, { read: true })).resolves.toMatchObject({ read: false });

    await waitForExpect(async () => {
      const registration = await alice.call('social-agent-registrations.getForAgent', {
        agentUri: bob.id,
        podOwner: alice.id
      });
      expect(arrayOf(registration['interop:hasAccessGrant'])).toEqual([grants[0].id]);
    });
  });
});
