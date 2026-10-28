import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import fetch from 'node-fetch';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf, fetchMails } from './utils.ts';
jest.setTimeout(100000);

describe('Test groups members handling', () => {
  let podProvider: any, alice: any, bob: any, craig: any, groupWebId: string, groupUrl: string, craigInvite: any;

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

  // Same request as a remote user would do, signed by the proxy of its own server
  const proxyAs = (actor: any, path: string, method = 'GET', body?: any) =>
    podProvider.call('signature.proxy.query', {
      url: urlJoin(groupUrl, path),
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      actorUri: actor.id
    });

  const getCollectionItems = async (actor: any, predicate: string) => {
    const webIdData = await podProvider.call('webid.get', { resourceUri: actor.id });
    if (!webIdData[predicate]) return [];
    const collection = await call(actor, 'activitypub.collection.get', { resourceUri: webIdData[predicate] });
    return arrayOf(collection.items);
  };

  const getGroups = (actor: any) => getCollectionItems(actor, 'interop:groups');

  const getInvitations = (actor: any) => getCollectionItems(actor, 'interop:groupInvitations');

  const getInbox = async (actor: any) => {
    const inboxMenu = await call(actor, 'activitypub.collection.get', { resourceUri: actor.inbox });
    const inbox = await call(actor, 'activitypub.collection.get', {
      resourceUri: actor.inbox,
      afterEq: new URL(inboxMenu.first).searchParams.get('afterEq')
    });
    return arrayOf(inbox.orderedItems);
  };

  const waitForInvitation = async (actor: any) => {
    let invite: any;
    await waitForExpect(async () => {
      invite = (await getInvitations(actor)).find((activity: any) => activity.actor === groupWebId);
      expect(invite).toMatchObject({ type: 'Invite', object: groupWebId, target: actor.id });
    });
    return invite;
  };

  const answerInvitation = (actor: any, invite: any, type: 'Accept' | 'Reject') =>
    call(actor, 'activitypub.outbox.post', {
      collectionUri: actor.outbox,
      type,
      actor: actor.id,
      object: invite.id,
      to: groupWebId
    });

  const waitForMembership = (actor: any) =>
    waitForExpect(async () => {
      const member = await getRole('member');
      expect(arrayOf(member['interop:hasMember'])).toContain(actor.id);
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

  test('The group has a role registry with the Owner, Admin and Member roles', async () => {
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
    expect(arrayOf(roleRegistry['interop:hasRoleRegistration'])).toHaveLength(3);

    const adminUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'admin' });
    await expect(getRole('owner')).resolves.toMatchObject({
      'interop:isSystemRole': true,
      'interop:extendsRole': adminUri,
      'interop:hasMember': alice.id
    });

    const admin = await getRole('admin');
    expect(admin['interop:isSystemRole']).toBeUndefined();
    expect(admin['interop:hasMember']).toBeUndefined();
    expect(arrayOf(admin['interop:hasSpecialRight'])).toEqual(
      expect.arrayContaining(['interop:ReadMembers', 'interop:ManageMembers', 'interop:ManageRoles'])
    );

    await expect(getRole('member')).resolves.toMatchObject({
      'interop:isSystemRole': true,
      'interop:isDefaultRole': true,
      'interop:hasMember': alice.id
    });

    await expect(call(alice, 'groups.list', {})).resolves.toEqual([groupWebId]);
    await expect(getGroups(alice)).resolves.toEqual([groupWebId]);
  });

  test('Users do not have a role registry', async () => {
    const registrySet = await podProvider.call('registry-set.get', { webId: alice.id });
    expect(registrySet['interop:hasRoleRegistry']).toBeUndefined();
  });

  test('Alice invites Bob, who accepts the invitation', async () => {
    const res = await fetchAs(alice, 'members', 'POST', { memberUri: bob.id });
    expect(res.status).toBe(200);

    const invite = await waitForInvitation(bob);
    const member = await getRole('member');
    expect(arrayOf(member['interop:hasMember'])).not.toContain(bob.id);
    await expect((await fetchAs(alice, 'members')).json()).resolves.toContainEqual({
      webId: bob.id,
      roles: [],
      invited: true
    });

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({ recipients: ['<bob@test.com>'], subject: 'acme invites you to join the group' })
      );
    });

    // A second invitation is not sent while the first one is pending
    expect((await fetchAs(alice, 'members', 'POST', { memberUri: bob.id })).status).toBe(200);

    await answerInvitation(bob, invite, 'Accept');

    await waitForMembership(bob);
    await waitForExpect(async () => {
      await expect(
        podProvider.call('social-agent-registrations.getForAgent', { agentUri: bob.id, podOwner: groupWebId })
      ).resolves.toBeTruthy();
    });
    await expect(getGroups(bob)).resolves.toEqual([groupWebId]);
    await expect(getInvitations(bob)).resolves.toEqual([]);

    const sentInvites = (await getInbox(bob)).filter((activity: any) => activity.type === 'Invite');
    expect(sentInvites).toHaveLength(1);
  });

  test('Alice cancels the invitation sent to Craig', async () => {
    expect((await fetchAs(alice, 'members', 'POST', { memberUri: craig.id })).status).toBe(200);
    const invite = await waitForInvitation(craig);

    expect((await fetchAs(alice, 'members', 'DELETE', { memberUri: craig.id })).status).toBe(200);

    await waitForExpect(async () => {
      await expect(getInvitations(craig)).resolves.toEqual([]);
    });
    const members = await (await fetchAs(alice, 'members')).json();
    expect(members.map((member: any) => member.webId)).not.toContain(craig.id);

    // The cancelled invitation cannot be accepted anymore
    await answerInvitation(craig, invite, 'Accept');
    await new Promise(resolve => setTimeout(resolve, 3000));
    expect(arrayOf((await getRole('member'))['interop:hasMember'])).not.toContain(craig.id);
  });

  test('Members can see their own roles and rights, but not the others', async () => {
    let res = await fetchAs(bob, 'me');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ roles: [{ id: 'member', label: 'Member' }], specialRights: [] });

    res = await fetchAs(alice, 'me');
    const aliceRoles = await res.json();
    expect(aliceRoles.roles.map((role: any) => role.id)).toEqual(expect.arrayContaining(['member', 'admin', 'owner']));
    expect(aliceRoles.specialRights).toHaveLength(4);
    expect(aliceRoles.specialRights).toContain('interop:ChangeJoinPolicy');

    await expect((await fetchAs(craig, 'me')).json()).resolves.toEqual({ roles: [], specialRights: [] });

    await expect(proxyAs(bob, 'me')).resolves.toMatchObject({ ok: true, body: { specialRights: [] } });
    await expect(proxyAs(craig, 'me')).resolves.toMatchObject({ ok: true, body: { roles: [] } });
  });

  test('Alice can list the members, but not Bob', async () => {
    const res = await fetchAs(alice, 'members');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.arrayContaining([
        { webId: alice.id, roles: expect.arrayContaining(['member', 'admin', 'owner']) },
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

  test('Alice makes Bob an admin, then Bob invites Craig but cannot touch the owners', async () => {
    expect((await fetchAs(alice, 'roles/admin/members', 'POST', { memberUri: bob.id })).status).toBe(200);
    expect((await fetchAs(alice, 'roles/admin/members', 'POST', { memberUri: craig.id })).status).toBe(400);

    await expect(proxyAs(bob, 'members', 'POST', { memberUri: craig.id })).resolves.toMatchObject({ ok: true });
    const invite = await waitForInvitation(craig);
    await answerInvitation(craig, invite, 'Reject');
    await waitForExpect(async () => {
      await expect(getInvitations(craig)).resolves.toEqual([]);
    });

    await expect(proxyAs(bob, 'members', 'POST', { memberUri: craig.id })).resolves.toMatchObject({ ok: true });
    craigInvite = await waitForInvitation(craig);
    expect(craigInvite.id).not.toBe(invite.id);
    await answerInvitation(craig, craigInvite, 'Accept');
    await waitForMembership(craig);

    expect((await fetchAs(bob, 'roles/owner/members', 'POST', { memberUri: craig.id })).status).toBe(403);
    expect((await fetchAs(bob, 'roles/owner/members', 'DELETE', { memberUri: alice.id })).status).toBe(403);
    expect((await fetchAs(bob, 'members', 'DELETE', { memberUri: alice.id })).status).toBe(403);

    const owner = await getRole('owner');
    expect(arrayOf(owner['interop:hasMember'])).toEqual([alice.id]);
    await waitForExpect(async () => {
      await expect(getGroups(craig)).resolves.toEqual([groupWebId]);
    });
  });

  test('Bob creates a role extending Admin, with the rights he has', async () => {
    let res = await fetchAs(bob, 'roles', 'POST', { label: 'Moderators', extendsRoles: ['owner'] });
    expect(res.status).toBe(403);

    res = await fetchAs(bob, 'roles', 'POST', { label: 'Moderators', specialRights: ['apods:PostOutbox'] });
    expect(res.status).toBe(403);

    res = await fetchAs(bob, 'roles', 'POST', {
      label: 'Moderators',
      extendsRoles: ['admin'],
      specialRights: ['interop:ReadMembers']
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 'moderators' });

    expect((await fetchAs(bob, 'roles/moderators/members', 'POST', { memberUri: craig.id })).status).toBe(200);

    res = await fetchAs(bob, 'members');
    await expect(res.json()).resolves.toContainEqual({
      webId: craig.id,
      roles: expect.arrayContaining(['member', 'admin', 'moderators'])
    });
    await expect(
      podProvider.call('role-registrations.hasSpecialRight', {
        groupWebId,
        agentUri: craig.id,
        right: 'interop:ManageRoles'
      })
    ).resolves.toBe(true);
  });

  test('Bob cannot create a cycle, nor modify or delete system roles', async () => {
    let res = await fetchAs(bob, 'roles/admin', 'PUT', { label: 'Admin', extendsRoles: ['moderators'] });
    expect(res.status).toBe(400);

    res = await fetchAs(bob, 'roles/owner', 'PUT', { label: 'Owners' });
    expect(res.status).toBe(403);
    expect((await fetchAs(bob, 'roles/owner', 'DELETE')).status).toBe(403);
    expect((await fetchAs(bob, 'roles/member', 'DELETE')).status).toBe(403);
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

    await waitForExpect(async () => {
      await expect(getGroups(craig)).resolves.toEqual([]);
    });
    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({ recipients: ['<craig@test.com>'], subject: 'You are no longer a member of acme' })
      );
    });

    // An invitation can only be accepted once
    await answerInvitation(craig, craigInvite, 'Accept');
    await new Promise(resolve => setTimeout(resolve, 3000));
    expect(arrayOf((await getRole('member'))['interop:hasMember'])).not.toContain(craig.id);
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

  test('Bob deletes the Admin role, the owners and moderators are still members', async () => {
    const adminUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'admin' });
    expect((await fetchAs(bob, 'roles/admin', 'DELETE')).status).toBe(200);

    await expect(podProvider.call('role-registrations.getUri', { groupWebId, role: 'admin' })).resolves.toBeUndefined();

    const owner = await getRole('owner');
    expect(owner['interop:extendsRole']).toBeUndefined();
    const moderators = await getRole('moderators');
    expect(moderators['interop:extendsRole']).toBeUndefined();

    const roleRegistry = await podProvider.call('role-registry.get', {
      resourceUri: await podProvider.call('role-registry.getResourceUri', { webId: groupWebId }),
      webId: 'system'
    });
    expect(arrayOf(roleRegistry['interop:hasRoleRegistration'])).not.toContain(adminUri);

    const res = await fetchAs(bob, 'members');
    await expect(res.json()).resolves.toContainEqual({
      webId: bob.id,
      roles: expect.arrayContaining(['member', 'owner'])
    });
    await expect(call(bob, 'groups.listMembers', { username: 'acme' })).resolves.toHaveLength(2);
  });

  test('Alice leaves the group, but Bob cannot as its last owner', async () => {
    const leave = (actor: any) =>
      call(actor, 'activitypub.outbox.post', {
        collectionUri: actor.outbox,
        type: 'Leave',
        actor: actor.id,
        object: groupWebId,
        to: groupWebId
      });

    await leave(alice);

    await waitForExpect(async () => {
      const member = await getRole('member');
      expect(arrayOf(member['interop:hasMember'])).not.toContain(alice.id);
    });
    await expect(
      podProvider.call('social-agent-registrations.getForAgent', { agentUri: alice.id, podOwner: groupWebId })
    ).resolves.toBeFalsy();
    await waitForExpect(async () => {
      await expect(getInbox(alice)).resolves.toContainEqual(
        expect.objectContaining({ type: 'Accept', actor: groupWebId, object: expect.stringContaining(alice.id) })
      );
    });
    await waitForExpect(async () => {
      await expect(getGroups(alice)).resolves.toEqual([]);
    });

    await leave(bob);
    await waitForExpect(async () => {
      await expect(getInbox(bob)).resolves.toContainEqual(
        expect.objectContaining({ type: 'Reject', actor: groupWebId, object: expect.stringContaining(bob.id) })
      );
    });

    const owner = await getRole('owner');
    expect(arrayOf(owner['interop:hasMember'])).toEqual([bob.id]);
    await expect(getGroups(bob)).resolves.toEqual([groupWebId]);
  });
});
