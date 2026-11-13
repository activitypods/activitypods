import urlJoin from 'url-join';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(100000);

const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');

describe('Test the authorization endpoint', () => {
  let podProvider: any,
    alice: any,
    bob: any,
    craig: any,
    groupWebId: string,
    memberRoleUri: string,
    aliceEventUri: string,
    groupEventUri: string,
    groupEvent2Uri: string;

  const call = (actor: any, actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id } });

  const getAuthorizations = (actor: any, params: any) =>
    call(actor, 'authorization-endpoint.getAuthorizations', params);

  const updateAuthorizations = (actor: any, params: any) =>
    call(actor, 'authorization-endpoint.updateAuthorizations', params);

  const hasRights = async (actor: any, resourceUri: string, rights: any) =>
    podProvider.call('webacl.resource.hasRights', { resourceUri, rights, webId: actor.id });

  const createEvent = async (webId: string, dataset: string, name: string) => {
    const containerUri = await podProvider.call(
      'data-registrations.generateFromShapeTree',
      { shapeTreeUri: EVENT_SHAPE_TREE, podOwner: webId },
      { meta: { webId, dataset } }
    );
    return podProvider.call(
      'ldp.container.post',
      { containerUri, resource: { type: OBJECT_TYPES.EVENT, name }, contentType: MIME_TYPES.JSON, webId },
      { meta: { webId, dataset } }
    );
  };

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

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

    memberRoleUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' });
    await podProvider.call('role-registrations.addMember', { roleRegistrationUri: memberRoleUri, agentUri: bob.id });

    aliceEventUri = await createEvent(alice.id, 'alice', 'Birthday party');
    groupEventUri = await createEvent(groupWebId, 'acme', 'General assembly');
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('A resource or a shape tree must be provided', async () => {
    await expect(updateAuthorizations(alice, { authorizations: [] })).rejects.toMatchObject({ code: 400 });
  });

  test('The owner of a personal pod shares a resource', async () => {
    await updateAuthorizations(alice, {
      resourceUri: aliceEventUri,
      authorizations: [{ grantee: bob.id, accessModes: ['acl:Read'] }]
    });

    await expect(getAuthorizations(alice, { resource: aliceEventUri })).resolves.toEqual({
      resourceUri: aliceEventUri,
      authorizations: [{ grantee: bob.id, accessModes: ['acl:Read'] }]
    });
    await expect(hasRights(bob, aliceEventUri, { read: true })).resolves.toMatchObject({ read: true });
  });

  test('Nobody else can manage the authorizations of a personal pod', async () => {
    await expect(getAuthorizations(bob, { resource: aliceEventUri })).rejects.toMatchObject({ code: 403 });
    await expect(
      updateAuthorizations(bob, {
        resourceUri: aliceEventUri,
        authorizations: [{ grantee: craig.id, accessModes: ['acl:Read'] }]
      })
    ).rejects.toMatchObject({ code: 403 });
    await expect(getAuthorizations(bob, { shapeTree: EVENT_SHAPE_TREE, podOwner: alice.id })).rejects.toMatchObject({
      code: 403
    });
  });

  test('A member without ManageAccess right cannot share the data of the group', async () => {
    await expect(getAuthorizations(bob, { resource: groupEventUri })).rejects.toMatchObject({ code: 403 });
    await expect(
      updateAuthorizations(bob, {
        resourceUri: groupEventUri,
        authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read'] }]
      })
    ).rejects.toMatchObject({ code: 403 });
  });

  test('An owner of the group shares a resource of the group with a role', async () => {
    await updateAuthorizations(alice, {
      resourceUri: groupEventUri,
      authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read'] }]
    });

    const result = await getAuthorizations(alice, { resource: groupEventUri });
    expect(result).toMatchObject({
      resourceUri: groupEventUri,
      authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read'] }]
    });
    expect(result.roles).toContainEqual({ uri: memberRoleUri, id: 'member', label: 'Member' });
    expect(result.members.sort()).toEqual([alice.id, bob.id].sort());
    await expect(hasRights(bob, groupEventUri, { read: true })).resolves.toMatchObject({ read: true });
  });

  test('The data of the group cannot be shared outside of the group', async () => {
    await expect(
      updateAuthorizations(alice, {
        resourceUri: groupEventUri,
        authorizations: [{ grantee: craig.id, accessModes: ['acl:Read'] }]
      })
    ).rejects.toMatchObject({ code: 403 });
    await expect(hasRights(craig, groupEventUri, { read: true })).resolves.toMatchObject({ read: false });
  });

  test('An owner of the group shares all events of the group with a role', async () => {
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read', 'acl:Write'] }]
    });

    const { authorizations } = await getAuthorizations(alice, { shapeTree: EVENT_SHAPE_TREE, podOwner: groupWebId });
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0].grantee).toBe(memberRoleUri);
    expect(authorizations[0].accessModes).toEqual(expect.arrayContaining(['acl:Read', 'acl:Write']));

    groupEvent2Uri = await createEvent(groupWebId, 'acme', 'Picnic');
    await expect(hasRights(bob, groupEvent2Uri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: true
    });
  });

  test('Empty access modes remove the authorization', async () => {
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: memberRoleUri, accessModes: [] }]
    });

    await expect(
      getAuthorizations(alice, { shapeTree: EVENT_SHAPE_TREE, podOwner: groupWebId })
    ).resolves.toMatchObject({ authorizations: [] });
    await expect(hasRights(bob, groupEvent2Uri, { read: true })).resolves.toMatchObject({ read: false });
    // The resource shared on its own is still readable
    await expect(hasRights(bob, groupEventUri, { read: true })).resolves.toMatchObject({ read: true });
  });
});
