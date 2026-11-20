import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import fetch from 'node-fetch';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(100000);

const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');
const FOAF_AGENT = 'http://xmlns.com/foaf/0.1/Agent';
const AUTHENTICATED_AGENT = 'http://www.w3.org/ns/auth/acl#AuthenticatedAgent';

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

  const fetchAnonymously = async (uri: string) => (await fetch(uri, { headers: { Accept: MIME_TYPES.JSON } })).json();

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
    expect(result.roles).toContainEqual({ uri: memberRoleUri, id: 'member', label: 'Member', isAdmin: false });
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
    const membersAuthorization = authorizations.find((a: any) => a.grantee === memberRoleUri);
    expect(membersAuthorization.accessModes).toEqual(expect.arrayContaining(['acl:Read', 'acl:Write']));

    groupEvent2Uri = await createEvent(groupWebId, 'acme', 'Picnic');
    await expect(hasRights(bob, groupEvent2Uri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: true
    });
  });

  test('The admins have full access to each type of data of the group', async () => {
    const { authorizations, roles } = await getAuthorizations(alice, {
      shapeTree: EVENT_SHAPE_TREE,
      podOwner: groupWebId
    });
    const adminRoles = roles.filter((role: any) => role.isAdmin).map((role: any) => role.uri);
    expect(adminRoles).toHaveLength(2);
    for (const roleUri of adminRoles) {
      const authorization = authorizations.find((a: any) => a.grantee === roleUri);
      expect(authorization.accessModes).toEqual(expect.arrayContaining(['acl:Read', 'acl:Write']));
    }
  });

  test('A member allowed to share a type of data shares its resources one by one', async () => {
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read', 'acl:Write'], delegationAllowed: true }]
    });

    // The access to the type cannot be managed
    await expect(getAuthorizations(bob, { shapeTree: EVENT_SHAPE_TREE, podOwner: groupWebId })).rejects.toMatchObject({
      code: 403
    });
    await expect(
      updateAuthorizations(bob, {
        shapeTreeUri: EVENT_SHAPE_TREE,
        podOwner: groupWebId,
        authorizations: [{ grantee: alice.id, accessModes: ['acl:Read'] }]
      })
    ).rejects.toMatchObject({ code: 403 });

    // A resource can be shared, and its own authorizations removed
    const { roles, delegateModes } = await getAuthorizations(bob, { resource: groupEvent2Uri });
    expect(delegateModes).toEqual(expect.arrayContaining(['acl:Read', 'acl:Write']));
    const update = (authorization: any) =>
      updateAuthorizations(bob, { resourceUri: groupEvent2Uri, authorizations: [authorization] });
    await update({ grantee: alice.id, accessModes: ['acl:Read'] });
    await expect(getAuthorizations(alice, { resource: groupEvent2Uri })).resolves.toMatchObject({
      authorizations: [{ grantee: alice.id, accessModes: ['acl:Read'] }]
    });
    await update({ grantee: alice.id, accessModes: [] });
    await expect(getAuthorizations(alice, { resource: groupEvent2Uri })).resolves.toMatchObject({ authorizations: [] });

    // Within the limits of their own rights
    await expect(update({ grantee: alice.id, accessModes: ['acl:Read', 'acl:Control'] })).rejects.toMatchObject({
      code: 403
    });
    await expect(update({ grantee: FOAF_AGENT, accessModes: ['acl:Read'] })).rejects.toMatchObject({ code: 403 });
    const adminRole = roles.find((role: any) => role.isAdmin);
    await expect(update({ grantee: adminRole.uri, accessModes: ['acl:Read'] })).rejects.toMatchObject({ code: 403 });

    // Without the right to share, the member is refused again
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read', 'acl:Write'] }]
    });
    await expect(getAuthorizations(bob, { resource: groupEvent2Uri })).rejects.toMatchObject({ code: 403 });
  });

  test('Empty access modes remove the authorization', async () => {
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: memberRoleUri, accessModes: [] }]
    });

    const { authorizations } = await getAuthorizations(alice, { shapeTree: EVENT_SHAPE_TREE, podOwner: groupWebId });
    expect(authorizations.find((a: any) => a.grantee === memberRoleUri)).toBeUndefined();
    await expect(hasRights(bob, groupEvent2Uri, { read: true })).resolves.toMatchObject({ read: false });
    // The resource shared on its own is still readable
    await expect(hasRights(bob, groupEventUri, { read: true })).resolves.toMatchObject({ read: true });
  });

  test('A resource shared with a group can be shared with its members', async () => {
    const craigEventUri = await createEvent(craig.id, 'craig', 'Concert');

    await updateAuthorizations(craig, {
      resourceUri: craigEventUri,
      authorizations: [{ grantee: groupWebId, accessModes: ['acl:Read'] }]
    });

    const [authorization] = await podProvider.call(
      'access-authorizations.listForSingleResource',
      { resourceUri: craigEventUri, webId: craig.id },
      { meta: { webId: craig.id, dataset: 'craig' } }
    );
    expect(authorization).toMatchObject({ 'interop:delegationAllowed': true, 'interop:delegationLimit': 1 });

    await waitForExpect(async () => {
      await expect(hasRights(bob, craigEventUri, { read: true })).resolves.toMatchObject({ read: true });
    });
  });

  test('The owner of a personal pod makes a resource public', async () => {
    await updateAuthorizations(alice, {
      resourceUri: aliceEventUri,
      authorizations: [{ grantee: 'foaf:Agent', accessModes: ['acl:Read'] }]
    });

    const { authorizations } = await getAuthorizations(alice, { resource: aliceEventUri });
    expect(authorizations).toContainEqual({ grantee: FOAF_AGENT, accessModes: ['acl:Read'] });
    await expect(hasRights({ id: 'anon' }, aliceEventUri, { read: true })).resolves.toMatchObject({ read: true });
    await expect(hasRights(craig, aliceEventUri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: false
    });

    // Visitors find the grant from the WebID
    const webId: any = await fetchAnonymously(alice.id);
    const registration: any = await fetchAnonymously(webId['interop:hasPublicAgentRegistration']);
    expect(registration).toMatchObject({ 'interop:registeredAgent': 'foaf:Agent' });
    const grants = await Promise.all(arrayOf(registration['interop:hasAccessGrant']).map(fetchAnonymously));
    expect(grants).toContainEqual(
      expect.objectContaining({
        'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
        'interop:hasDataInstance': aliceEventUri
      })
    );
  });

  test('The owner of a personal pod makes a resource private again', async () => {
    await updateAuthorizations(alice, {
      resourceUri: aliceEventUri,
      authorizations: [{ grantee: FOAF_AGENT, accessModes: [] }]
    });

    const { authorizations } = await getAuthorizations(alice, { resource: aliceEventUri });
    expect(authorizations.find((a: any) => a.grantee === FOAF_AGENT)).toBeUndefined();
    await expect(hasRights({ id: 'anon' }, aliceEventUri, { read: true })).resolves.toMatchObject({ read: false });
    await expect(hasRights(craig, aliceEventUri, { read: true })).resolves.toMatchObject({ read: false });
    // The authorization given to Bob is kept
    await expect(hasRights(bob, aliceEventUri, { read: true })).resolves.toMatchObject({ read: true });

    const webId: any = await fetchAnonymously(alice.id);
    const registration: any = await fetchAnonymously(webId['interop:hasPublicAgentRegistration']);
    expect(arrayOf(registration['interop:hasAccessGrant'])).toHaveLength(0);
  });

  test('An owner of the group shares all events of the group with authenticated agents', async () => {
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: AUTHENTICATED_AGENT, accessModes: ['acl:Read'] }]
    });

    const { authorizations } = await getAuthorizations(alice, { shapeTree: EVENT_SHAPE_TREE, podOwner: groupWebId });
    expect(authorizations).toContainEqual({ grantee: AUTHENTICATED_AGENT, accessModes: ['acl:Read'] });
    await expect(hasRights(craig, groupEvent2Uri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: false
    });
    await expect(hasRights({ id: 'anon' }, groupEvent2Uri, { read: true })).resolves.toMatchObject({ read: false });

    const group: any = await fetchAnonymously(groupWebId);
    const registration: any = await fetchAnonymously(group['interop:hasConnectedAgentRegistration']);
    const [grantUri] = arrayOf(registration['interop:hasAccessGrant']);
    await expect(hasRights(craig, grantUri, { read: true })).resolves.toMatchObject({ read: true });
    await expect(hasRights({ id: 'anon' }, grantUri, { read: true })).resolves.toMatchObject({ read: false });

    // Also for new events
    const groupEvent3Uri = await createEvent(groupWebId, 'acme', 'Hackathon');
    await expect(hasRights(craig, groupEvent3Uri, { read: true })).resolves.toMatchObject({ read: true });
  });

  test('An owner of the group changes the access modes of authenticated agents', async () => {
    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: AUTHENTICATED_AGENT, accessModes: ['acl:Read', 'acl:Write'] }]
    });
    await expect(hasRights(craig, groupEvent2Uri, { read: true, write: true })).resolves.toMatchObject({
      read: true,
      write: true
    });

    await updateAuthorizations(alice, {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: AUTHENTICATED_AGENT, accessModes: [] }]
    });
    await expect(hasRights(craig, groupEvent2Uri, { read: true, write: true })).resolves.toMatchObject({
      read: false,
      write: false
    });
  });

  test('Data shared by someone else cannot be made public', async () => {
    const [authorization] = await podProvider.call(
      'access-authorizations.listByGrantee',
      { grantee: groupWebId, webId: craig.id },
      { meta: { webId: craig.id, dataset: 'craig' } }
    );
    const craigEventUri = arrayOf(authorization['interop:hasDataInstance'])[0];

    // The group may share it with its members, but not with everyone
    await expect(
      podProvider.call(
        'access-authorizations.addForSingleResource',
        { resourceUri: craigEventUri, grantee: FOAF_AGENT, accessModes: ['acl:Read'], webId: groupWebId },
        { meta: { webId: groupWebId, dataset: 'acme' } }
      )
    ).rejects.toMatchObject({ code: 403 });
    await expect(hasRights({ id: 'anon' }, craigEventUri, { read: true })).resolves.toMatchObject({ read: false });
  });
});
