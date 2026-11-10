import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(100000);

describe('Test access to groups data through roles', () => {
  let podProvider: any,
    alice: any,
    bob: any,
    craig: any,
    groupWebId: string,
    containerUri: string,
    eventUri: string,
    event2Uri: string;

  const callAsGroup = (actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: groupWebId, dataset: 'acme' } });

  const hasRights = async (actor: any, rights: any, resourceUri = eventUri) =>
    podProvider.call('webacl.resource.hasRights', { resourceUri, rights, webId: actor.id });

  const getRoleGrants = async () => {
    const container = await podProvider.call('access-grants.list', {
      filters: { 'http://www.w3.org/ns/solid/interop#derivedFromRoleRegistration': await getRoleUri('member') },
      webId: groupWebId
    });
    return arrayOf(container['ldp:contains']);
  };

  const getGrantees = async () => (await getRoleGrants()).map((grant: any) => grant['interop:grantee']).sort();

  const shareWithMembers = async (accessModes: string[], resourceUri = eventUri) =>
    callAsGroup('access-authorizations.addForSingleResource', {
      resourceUri,
      grantee: await getRoleUri('member'),
      accessModes,
      webId: groupWebId
    });

  const call = (actor: any, actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id } });

  const getRoleUri = (role: string) => podProvider.call('role-registrations.getUri', { groupWebId, role });

  const getWacGroupUri = async (role: string) =>
    podProvider.call('role-registrations.getWacGroupUri', {
      groupWebId,
      roleRegistrationUri: await getRoleUri(role)
    });

  const getWacGroupMembers = async (role: string) =>
    podProvider.call(
      'webacl.group.getMembers',
      { groupUri: await getWacGroupUri(role), webId: 'system' },
      { meta: { dataset: 'acme' } }
    );

  const wacGroupExists = async (groupUri: string) =>
    podProvider.call('webacl.group.exist', { groupUri, webId: 'system' }, { meta: { dataset: 'acme' } });

  const addToRole = async (actor: any, role: string) =>
    podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: await getRoleUri(role),
      agentUri: actor.id
    });

  const removeFromRole = async (actor: any, role: string) =>
    podProvider.call('role-registrations.removeMember', {
      roleRegistrationUri: await getRoleUri(role),
      agentUri: actor.id
    });

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    const actors = [];
    for (let i = 1; i <= 3; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId, token } = await podProvider.call('auth.signup', actorData);
      const actor = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        { actorUri: webId },
        { meta: { dataset: actorData.username } }
      );
      actors.push({ ...actor, token });
    }
    [alice, bob, craig] = actors;

    await call(alice, 'groups.create', { id: 'acme', type: 'foaf:Organization' });
    groupWebId = urlJoin(new URL(alice.id).origin, 'acme');
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Owner and Admin roles have the ManageAccess special right', async () => {
    for (const role of ['owner', 'admin']) {
      const roleRegistration = await podProvider.call('role-registrations.get', {
        resourceUri: await getRoleUri(role),
        webId: 'system'
      });
      expect(arrayOf(roleRegistration['interop:hasSpecialRight'])).toContain('interop:ManageAccess');
    }
  });

  test('Each role has a WAC group with its effective members', async () => {
    await expect(getWacGroupMembers('owner')).resolves.toEqual([alice.id]);
    await expect(getWacGroupMembers('admin')).resolves.toEqual([alice.id]);
    await expect(getWacGroupMembers('member')).resolves.toEqual([alice.id]);
  });

  test('Adding someone to a role updates the WAC groups of this role and the roles it extends', async () => {
    await addToRole(bob, 'member');
    await expect(getWacGroupMembers('member')).resolves.toEqual(expect.arrayContaining([alice.id, bob.id]));
    await expect(getWacGroupMembers('admin')).resolves.toEqual([alice.id]);

    await addToRole(craig, 'owner');
    await expect(getWacGroupMembers('owner')).resolves.toEqual(expect.arrayContaining([alice.id, craig.id]));
    await expect(getWacGroupMembers('admin')).resolves.toEqual(expect.arrayContaining([alice.id, craig.id]));
    // Every agent with a role is a member of the default role
    await expect(getWacGroupMembers('member')).resolves.toHaveLength(3);
  });

  test('Removing someone from a role updates the WAC groups', async () => {
    await removeFromRole(craig, 'owner');
    await expect(getWacGroupMembers('owner')).resolves.toEqual([alice.id]);
    await expect(getWacGroupMembers('admin')).resolves.toEqual([alice.id]);
    await expect(getWacGroupMembers('member')).resolves.toEqual(expect.arrayContaining([alice.id, bob.id]));
    await expect(getWacGroupMembers('member')).resolves.toHaveLength(2);
  });

  test('A custom role gets a WAC group, which follows the roles hierarchy', async () => {
    const adminUri = await getRoleUri('admin');
    await podProvider.call('role-registrations.createRole', {
      groupWebId,
      slug: 'moderator',
      role: { 'skos:prefLabel': 'Moderator', 'interop:hasMember': bob.id }
    });
    await expect(getWacGroupMembers('moderator')).resolves.toEqual([bob.id]);
    await expect(getWacGroupMembers('admin')).resolves.toEqual([alice.id]);

    await podProvider.call('role-registrations.updateRole', {
      resourceUri: await getRoleUri('moderator'),
      role: { 'interop:extendsRole': adminUri }
    });
    await expect(getWacGroupMembers('admin')).resolves.toEqual(expect.arrayContaining([alice.id, bob.id]));
  });

  test('Deleting a role deletes its WAC group and updates the roles it extended', async () => {
    const wacGroupUri = await getWacGroupUri('moderator');

    await podProvider.call('role-registrations.deleteRole', {
      groupWebId,
      resourceUri: await getRoleUri('moderator')
    });

    await expect(wacGroupExists(wacGroupUri)).resolves.toBeFalsy();
    await expect(getWacGroupMembers('admin')).resolves.toEqual([alice.id]);
    await expect(getWacGroupMembers('member')).resolves.toHaveLength(2);
  });

  test('A resource of the group can be shared with a role', async () => {
    containerUri = await callAsGroup('data-registrations.generateFromShapeTree', {
      shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event'),
      podOwner: groupWebId
    });
    eventUri = await callAsGroup('ldp.container.post', {
      containerUri,
      resource: { type: OBJECT_TYPES.EVENT, name: 'General assembly' },
      contentType: MIME_TYPES.JSON,
      webId: groupWebId
    });

    await expect(hasRights(bob, { read: true })).resolves.toMatchObject({ read: false });

    await shareWithMembers(['acl:Read']);

    const authorizations = await callAsGroup('access-authorizations.listForSingleResource', { resourceUri: eventUri });
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0]['interop:grantee']).toBe(await getRoleUri('member'));

    await expect(hasRights(bob, { read: true, write: true })).resolves.toMatchObject({ read: true, write: false });
    await expect(hasRights(craig, { read: true })).resolves.toMatchObject({ read: false });
  });

  test('Each member of the role gets an access grant', async () => {
    const memberRoleUri = await getRoleUri('member');
    const grants = await getRoleGrants();
    expect(grants.map((grant: any) => grant['interop:grantee']).sort()).toEqual([alice.id, bob.id].sort());
    for (const grant of grants) {
      expect(grant).toMatchObject({
        'interop:dataOwner': groupWebId,
        'interop:grantedBy': groupWebId,
        'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
        'interop:hasDataInstance': eventUri,
        'interop:accessMode': 'acl:Read'
      });
      expect(grant['interop:derivedFromRoleRegistration']).toBe(memberRoleUri);
    }

    const bobGrant = grants.find((grant: any) => grant['interop:grantee'] === bob.id);
    const registration = await podProvider.call('social-agent-registrations.getForAgent', {
      agentUri: bob.id,
      podOwner: groupWebId
    });
    expect(arrayOf(registration['interop:hasAccessGrant'])).toContain(bobGrant.id);
  });

  test('A member removed from the role loses the access and the grant', async () => {
    await removeFromRole(bob, 'member');

    await expect(hasRights(bob, { read: true })).resolves.toMatchObject({ read: false });
    await expect(getGrantees()).resolves.toEqual([alice.id]);
  });

  test('A member added to a role extending the shared role gets the access and a grant', async () => {
    await addToRole(craig, 'owner');

    await expect(hasRights(craig, { read: true })).resolves.toMatchObject({ read: true });
    await expect(getGrantees()).resolves.toEqual([alice.id, craig.id].sort());
  });

  test('Changing the access modes recreates the grants', async () => {
    const oldGrants = await getRoleGrants();

    await shareWithMembers(['acl:Read', 'acl:Write']);

    await expect(hasRights(craig, { read: true, write: true })).resolves.toMatchObject({ read: true, write: true });

    const grants = await getRoleGrants();
    expect(grants).toHaveLength(2);
    for (const grant of grants) {
      expect(arrayOf(grant['interop:accessMode']).sort()).toEqual(['acl:Read', 'acl:Write']);
      expect(oldGrants.map((g: any) => g.id)).not.toContain(grant.id);
    }
  });

  test('Sharing another resource with the same access modes replaces the grants', async () => {
    event2Uri = await callAsGroup('ldp.container.post', {
      containerUri,
      resource: { type: OBJECT_TYPES.EVENT, name: 'Board meeting' },
      contentType: MIME_TYPES.JSON,
      webId: groupWebId
    });
    const oldGrants = await getRoleGrants();

    await shareWithMembers(['acl:Read', 'acl:Write'], event2Uri);

    await expect(hasRights(craig, { read: true }, event2Uri)).resolves.toMatchObject({ read: true });
    await expect(hasRights(craig, { read: true })).resolves.toMatchObject({ read: true });

    const grants = await getRoleGrants();
    expect(grants).toHaveLength(2);
    for (const grant of grants) {
      expect(arrayOf(grant['interop:hasDataInstance']).sort()).toEqual([eventUri, event2Uri].sort());
      const oldGrant = oldGrants.find((g: any) => g['interop:grantee'] === grant['interop:grantee']);
      expect(grant['interop:replaces']).toBe(oldGrant.id);
    }
  });

  test('Unsharing the resources removes the access and the grants', async () => {
    await callAsGroup('access-authorizations.removeForSingleResource', {
      resourceUri: eventUri,
      grantee: await getRoleUri('member'),
      webId: groupWebId
    });

    await expect(hasRights(craig, { read: true })).resolves.toMatchObject({ read: false });
    await expect(hasRights(craig, { read: true }, event2Uri)).resolves.toMatchObject({ read: true });
    await expect(getGrantees()).resolves.toEqual([alice.id, craig.id].sort());

    await callAsGroup('access-authorizations.removeForSingleResource', {
      resourceUri: event2Uri,
      grantee: await getRoleUri('member'),
      webId: groupWebId
    });

    await expect(hasRights(craig, { read: true }, event2Uri)).resolves.toMatchObject({ read: false });
    await expect(getRoleGrants()).resolves.toHaveLength(0);

    await waitForExpect(async () => {
      const registration = await podProvider.call('social-agent-registrations.getForAgent', {
        agentUri: craig.id,
        podOwner: groupWebId
      });
      expect(arrayOf(registration?.['interop:hasAccessGrant'])).toHaveLength(0);
    });
  });

  test('A direct share with the same content as a role share is kept apart', async () => {
    await shareWithMembers(['acl:Read'], event2Uri);
    await callAsGroup('access-authorizations.addForSingleResource', {
      resourceUri: event2Uri,
      grantee: craig.id,
      accessModes: ['acl:Read'],
      webId: groupWebId
    });
    await expect(getGrantees()).resolves.toEqual([alice.id, craig.id].sort());

    await callAsGroup('access-authorizations.removeForSingleResource', {
      resourceUri: event2Uri,
      grantee: await getRoleUri('member'),
      webId: groupWebId
    });

    await expect(getRoleGrants()).resolves.toHaveLength(0);
    await expect(hasRights(craig, { read: true }, event2Uri)).resolves.toMatchObject({ read: true });

    const directGrant = await podProvider.call('access-grants.getByResourceUri', {
      resourceUri: event2Uri,
      webId: groupWebId
    });
    expect(directGrant).toMatchObject({ 'interop:grantee': craig.id, 'interop:hasDataInstance': event2Uri });
    expect(directGrant['interop:derivedFromRoleRegistration']).toBeUndefined();
  });
});
