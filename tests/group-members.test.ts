import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import fetch from 'node-fetch';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf, fetchMails } from './utils.ts';
jest.setTimeout(100000);

describe('Test groups members handling', () => {
  let podProvider: any, alice: any, bob: any, craig: any, groupWebId: string, groupUrl: string;

  const call = (actor: any, actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id } });

  const fetchAs = (actor: any, path: string, method = 'GET', body?: any) =>
    fetch(urlJoin(groupUrl, path), {
      method,
      headers: {
        Authorization: `Bearer ${actor.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

  const getRole = async (role: string) =>
    podProvider.call('role-registrations.get', {
      resourceUri: await podProvider.call('role-registrations.getUri', { groupWebId, role }),
      webId: 'system'
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
    groupUrl = urlJoin(new URL(alice.id).origin, '.account/acme');
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('The group has a role registry with the Owner and Member roles', async () => {
    const group = await podProvider.call('webid.get', { resourceUri: groupWebId });
    const registrySet = await podProvider.call('registry-set.get', {
      resourceUri: group['interop:hasRegistrySet'],
      webId: 'system'
    });
    expect(registrySet['interop:hasRoleRegistry']).toBeDefined();

    const roleRegistry = await podProvider.call('role-registry.get', {
      resourceUri: registrySet['interop:hasRoleRegistry'],
      webId: 'system'
    });
    expect(arrayOf(roleRegistry['interop:hasRoleRegistration'])).toHaveLength(2);

    await expect(getRole('owner')).resolves.toMatchObject({
      'interop:isSystemRole': true,
      'interop:hasMember': alice.id
    });
    await expect(getRole('member')).resolves.toMatchObject({
      'interop:isSystemRole': true,
      'interop:isDefaultRole': true,
      'interop:hasMember': alice.id
    });

    await expect(call(alice, 'groups.list', {})).resolves.toEqual([groupWebId]);
  });

  test('Users do not have a role registry', async () => {
    const registrySet = await podProvider.call('registry-set.get', { webId: alice.id });
    expect(registrySet['interop:hasRoleRegistry']).toBeUndefined();
  });

  test('Alice adds Bob to the group', async () => {
    const res = await fetchAs(alice, 'members', 'POST', { memberUri: bob.id });
    expect(res.status).toBe(200);

    await expect(getRole('member')).resolves.toMatchObject({
      'interop:hasMember': expect.arrayContaining([alice.id, bob.id])
    });

    await expect(
      podProvider.call('social-agent-registrations.getForAgent', { agentUri: bob.id, podOwner: groupWebId })
    ).resolves.toBeTruthy();

    await waitForExpect(async () => {
      const inboxMenu = await call(bob, 'activitypub.collection.get', { resourceUri: bob.inbox });
      const inbox = await call(bob, 'activitypub.collection.get', {
        resourceUri: bob.inbox,
        afterEq: new URL(inboxMenu.first).searchParams.get('afterEq')
      });
      expect(arrayOf(inbox.orderedItems)).toContainEqual(
        expect.objectContaining({ type: 'Add', actor: groupWebId, object: bob.id, target: groupWebId })
      );
    });

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({ recipients: ['<bob@test.com>'], subject: 'You are now a member of acme' })
      );
    });
  });

  test('Alice can list the members, but not Bob', async () => {
    const res = await fetchAs(alice, 'members');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.arrayContaining([
        { webId: alice.id, roles: expect.arrayContaining(['member', 'owner']) },
        { webId: bob.id, roles: ['member'] }
      ])
    );

    expect((await fetchAs(bob, 'members')).status).toBe(403);
    expect((await fetchAs(bob, 'roles')).status).toBe(403);
  });

  test('Bob cannot add Craig, read the roles directly, delete or export the group', async () => {
    await expect(call(bob, 'groups.addMember', { username: 'acme', memberUri: craig.id })).rejects.toThrow();

    await expect(
      podProvider.call('ldp.resource.get', {
        resourceUri: await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' }),
        webId: bob.id
      })
    ).rejects.toThrow();

    await expect(call(bob, 'management.deleteAccount', { username: 'acme' })).rejects.toThrow();
    await expect(call(bob, 'management.exportAccount', { username: 'acme' })).rejects.toThrow();
  });

  test('Alice makes Bob an owner, then Bob adds Craig', async () => {
    const res = await fetchAs(alice, 'roles/owner/members', 'POST', { memberUri: bob.id });
    expect(res.status).toBe(200);

    await expect(getRole('owner')).resolves.toMatchObject({
      'interop:hasMember': expect.arrayContaining([alice.id, bob.id])
    });
    await expect(call(bob, 'groups.list', {})).resolves.toEqual([groupWebId]);
    await expect(
      podProvider.call('webacl.resource.hasRights', {
        resourceUri: urlJoin(groupWebId, 'data'),
        rights: { write: true },
        webId: bob.id
      })
    ).resolves.toMatchObject({ write: true });

    await call(bob, 'groups.addMember', { username: 'acme', memberUri: craig.id });

    await expect(getRole('member')).resolves.toMatchObject({
      'interop:hasMember': expect.arrayContaining([alice.id, bob.id, craig.id])
    });
  });

  test('Bob removes Craig from the group', async () => {
    const res = await fetchAs(bob, 'members', 'DELETE', { memberUri: craig.id });
    expect(res.status).toBe(200);

    const member = await getRole('member');
    expect(arrayOf(member['interop:hasMember'])).not.toContain(craig.id);

    await expect(
      podProvider.call('social-agent-registrations.getForAgent', { agentUri: craig.id, podOwner: groupWebId })
    ).resolves.toBeFalsy();
  });

  test('Bob removes Alice from the owners, but not himself as the last owner', async () => {
    await call(bob, 'groups.removeRoleMember', { username: 'acme', role: 'owner', memberUri: alice.id });

    const owner = await getRole('owner');
    expect(arrayOf(owner['interop:hasMember'])).toEqual([bob.id]);
    await expect(call(alice, 'groups.list', {})).resolves.toEqual([]);
    await expect(
      podProvider.call('webacl.resource.hasRights', {
        resourceUri: urlJoin(groupWebId, 'data'),
        rights: { write: true },
        webId: alice.id
      })
    ).resolves.toMatchObject({ write: false });

    await expect(
      call(bob, 'groups.removeRoleMember', { username: 'acme', role: 'owner', memberUri: bob.id })
    ).rejects.toThrow();
  });
});
