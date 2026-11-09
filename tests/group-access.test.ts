import urlJoin from 'url-join';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf } from './utils.ts';
jest.setTimeout(100000);

describe('Test access to groups data through roles', () => {
  let podProvider: any, alice: any, bob: any, craig: any, groupWebId: string;

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
});
