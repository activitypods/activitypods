import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(100000);

const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');

// Alice and Craig are on the first Pod provider, as the group, while Bob is on the second one
describe('Test the members of a group on another server', () => {
  let podProvider: any,
    podProvider2: any,
    alice: any,
    bob: any,
    craig: any,
    groupWebId: string,
    memberRoleUri: string,
    adminRoleUri: string,
    groupEventUri: string;

  const signup = async (broker: any, actorData: any) => {
    const { webId } = await broker.call('auth.signup', actorData);
    return broker.call(
      'activitypub.actor.awaitCreateComplete',
      { actorUri: webId },
      { meta: { dataset: actorData.username } }
    );
  };

  const call = (actor: any, actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id } });

  // Request signed by the proxy of Bob's server
  const fetchAsBob = async (params: Record<string, string>, body?: any) => {
    const url = new URL(urlJoin(new URL(groupWebId).origin, '.auth-agent/authorizations'));
    for (const [key, value] of Object.entries(params)) url.searchParams.append(key, value);
    return podProvider2.call('signature.proxy.query', {
      url: url.toString(),
      method: body ? 'PUT' : 'GET',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      actorUri: bob.id
    });
  };

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    podProvider2 = await connectPodProvider(2);

    alice = await signup(podProvider, require('./data/actor1.json'));
    bob = await signup(podProvider2, require('./data/actor2.json'));
    craig = await signup(podProvider, require('./data/actor3.json'));

    await call(alice, 'groups.create', { id: 'acme', type: 'foaf:Organization' });
    groupWebId = urlJoin(new URL(alice.id).origin, 'acme');

    memberRoleUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' });
    adminRoleUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'admin' });
    await podProvider.call('role-registrations.addMember', { roleRegistrationUri: memberRoleUri, agentUri: bob.id });

    const containerUri = await podProvider.call(
      'data-registrations.generateFromShapeTree',
      { shapeTreeUri: EVENT_SHAPE_TREE, podOwner: groupWebId },
      { meta: { webId: groupWebId, dataset: 'acme' } }
    );
    groupEventUri = await podProvider.call(
      'ldp.container.post',
      {
        containerUri,
        resource: { type: OBJECT_TYPES.EVENT, name: 'General assembly' },
        contentType: MIME_TYPES.JSON,
        webId: groupWebId
      },
      { meta: { webId: groupWebId, dataset: 'acme' } }
    );
  }, 100000);

  afterAll(async () => {
    await podProvider?.stop();
    await podProvider2?.stop();
  });

  test('Bob is on another server', () => {
    expect(new URL(bob.id).origin).not.toBe(new URL(groupWebId).origin);
  });

  test('A remote member without the ManageAccess right cannot manage the authorizations', async () => {
    await expect(fetchAsBob({ resource: groupEventUri })).resolves.toMatchObject({ ok: false, status: 403 });
  });

  test('A remote admin manages the authorizations of the group', async () => {
    await podProvider.call('role-registrations.addMember', { roleRegistrationUri: adminRoleUri, agentUri: bob.id });

    const { ok, body } = await fetchAsBob({ shapeTree: EVENT_SHAPE_TREE, podOwner: groupWebId });
    expect(ok).toBe(true);
    expect(body.members).toContain(bob.id);

    await expect(
      fetchAsBob(
        {},
        {
          resourceUri: groupEventUri,
          authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read'] }]
        }
      )
    ).resolves.toMatchObject({ ok: true });
    await expect(
      call(alice, 'authorization-endpoint.getAuthorizations', { resource: groupEventUri })
    ).resolves.toMatchObject({ authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read'] }] });

    await podProvider.call('role-registrations.removeMember', { roleRegistrationUri: adminRoleUri, agentUri: bob.id });
    await expect(fetchAsBob({ resource: groupEventUri })).resolves.toMatchObject({ ok: false, status: 403 });
  });

  test('A remote member allowed to share a type of data shares its resources one by one', async () => {
    await call(alice, 'authorization-endpoint.updateAuthorizations', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: groupWebId,
      authorizations: [{ grantee: memberRoleUri, accessModes: ['acl:Read', 'acl:Write'], delegationAllowed: true }]
    });

    await waitForExpect(async () => {
      const { ok, body } = await fetchAsBob({ resource: groupEventUri });
      expect(ok).toBe(true);
      expect(body.delegateModes).toEqual(expect.arrayContaining(['acl:Read', 'acl:Write']));
    });

    await expect(
      fetchAsBob(
        {},
        { resourceUri: groupEventUri, authorizations: [{ grantee: alice.id, accessModes: ['acl:Read'] }] }
      )
    ).resolves.toMatchObject({ ok: true });
    const { authorizations } = await call(alice, 'authorization-endpoint.getAuthorizations', {
      resource: groupEventUri
    });
    expect(authorizations).toContainEqual({ grantee: alice.id, accessModes: ['acl:Read'] });

    // Not beyond their own rights
    await expect(
      fetchAsBob(
        {},
        { resourceUri: groupEventUri, authorizations: [{ grantee: alice.id, accessModes: ['acl:Read', 'acl:Control'] }] }
      )
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });

  test('Craig, who is not a member, cannot manage the authorizations', async () => {
    await expect(
      call(craig, 'authorization-endpoint.getAuthorizations', { resource: groupEventUri })
    ).rejects.toMatchObject({ code: 403 });
  });
});
