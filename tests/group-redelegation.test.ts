import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(100000);

const INTEROP = 'http://www.w3.org/ns/solid/interop#';
const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');

describe('Test private data of members shared with a group', () => {
  let podProvider: any,
    alice: any,
    bob: any,
    craig: any,
    daisy: any,
    groupWebId: string,
    memberRoleUri: string,
    eventUri: string,
    privateEventUri: string,
    picnicUri: string;

  const call = (actor: any, actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id, dataset: actor.preferredUsername } });

  const hasRights = async (actor: any, resourceUri: string, rights: any) =>
    podProvider.call('webacl.resource.hasRights', { resourceUri, rights, webId: actor.id });

  const getGroupAuthorizations = async () => {
    const container = await podProvider.call(
      'access-authorizations.list',
      { filters: { [`${INTEROP}grantee`]: memberRoleUri }, webId: groupWebId },
      { meta: { dataset: 'acme' } }
    );
    return arrayOf(container['ldp:contains']);
  };

  const getDelegatedGrants = async () => {
    const container = await call(craig, 'delegated-access-grants.list', {
      filters: { [`${INTEROP}grantedBy`]: groupWebId },
      webId: craig.id
    });
    return arrayOf(container['ldp:contains']);
  };

  const getGrantees = async () =>
    (await getDelegatedGrants()).map((grant: any) => grant['interop:grantee']).sort();

  const getGrantsByInstances = async () =>
    Object.fromEntries(
      (await getDelegatedGrants()).map((grant: any) => [
        grant['interop:grantee'],
        { instances: arrayOf(grant['interop:hasDataInstance']).sort(), modes: arrayOf(grant['interop:accessMode']).sort() }
      ])
    );

  const createEvent = async (name: string) => {
    const containerUri = await call(craig, 'data-registrations.generateFromShapeTree', {
      shapeTreeUri: EVENT_SHAPE_TREE,
      podOwner: craig.id
    });
    return call(craig, 'ldp.container.post', {
      containerUri,
      resource: { type: OBJECT_TYPES.EVENT, name },
      contentType: MIME_TYPES.JSON,
      webId: craig.id
    });
  };

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    const actors = [];
    for (let i = 1; i <= 4; i++) {
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
    [alice, bob, craig, daisy] = actors;

    await call(alice, 'groups.create', { id: 'acme', type: 'foaf:Organization' });
    groupWebId = urlJoin(new URL(alice.id).origin, 'acme');

    memberRoleUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' });
    for (const actor of [bob, craig]) {
      await podProvider.call('role-registrations.addMember', {
        roleRegistrationUri: memberRoleUri,
        agentUri: actor.id
      });
    }

    eventUri = await createEvent('General assembly');
    privateEventUri = await createEvent('Birthday party');
    picnicUri = await createEvent('Picnic');
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Data shared with the group with the right to delegate it is shared with its members', async () => {
    await call(craig, 'access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: groupWebId,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    await waitForExpect(async () => {
      const authorizations = await getGroupAuthorizations();
      expect(authorizations).toHaveLength(1);
      expect(authorizations[0]).toMatchObject({
        'interop:dataOwner': craig.id,
        'interop:grantedBy': groupWebId,
        'interop:hasDataInstance': eventUri,
        'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
      });
    });

    // One delegated grant per member, except the data owner
    await waitForExpect(async () => {
      const delegatedGrants = await getDelegatedGrants();
      expect(delegatedGrants.map((grant: any) => grant['interop:grantee']).sort()).toEqual([alice.id, bob.id].sort());
      for (const grant of delegatedGrants) {
        expect(grant).toMatchObject({
          'interop:derivedFromRoleRegistration': memberRoleUri,
          'interop:hasDataInstance': eventUri
        });
        expect(grant['interop:delegationAllowed']).toBeUndefined();
      }
    });

    await waitForExpect(async () => {
      for (const actor of [alice, bob]) {
        await expect(hasRights(actor, eventUri, { read: true, write: true })).resolves.toMatchObject({
          read: true,
          write: false
        });
      }
    });
  });

  test('Data shared with the group without the right to delegate it is not shared with its members', async () => {
    await call(craig, 'access-authorizations.addForSingleResource', {
      resourceUri: privateEventUri,
      grantee: groupWebId,
      accessModes: ['acl:Read']
    });

    await waitForExpect(async () => {
      await expect(hasRights({ id: groupWebId }, privateEventUri, { read: true })).resolves.toMatchObject({
        read: true
      });
    });

    await expect(getGroupAuthorizations()).resolves.toHaveLength(1);
    for (const actor of [alice, bob]) {
      await expect(hasRights(actor, privateEventUri, { read: true })).resolves.toMatchObject({ read: false });
    }
  });

  test('A new member of the role gets access to the data shared with the group', async () => {
    await podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: memberRoleUri,
      agentUri: daisy.id
    });

    await waitForExpect(async () => {
      await expect(getGrantees()).resolves.toEqual([alice.id, bob.id, daisy.id].sort());
    });

    await waitForExpect(async () => {
      await expect(hasRights(daisy, eventUri, { read: true })).resolves.toMatchObject({ read: true });
    });

    await expect(hasRights(daisy, privateEventUri, { read: true })).resolves.toMatchObject({ read: false });
  });

  test('A member removed from the role loses access to the data shared with the group', async () => {
    await podProvider.call('role-registrations.removeMember', {
      roleRegistrationUri: memberRoleUri,
      agentUri: bob.id
    });

    await waitForExpect(async () => {
      await expect(getGrantees()).resolves.toEqual([alice.id, daisy.id].sort());
    });

    await waitForExpect(async () => {
      await expect(hasRights(bob, eventUri, { read: true })).resolves.toMatchObject({ read: false });
    });

    for (const actor of [alice, daisy]) {
      await expect(hasRights(actor, eventUri, { read: true })).resolves.toMatchObject({ read: true });
    }
  });

  test('If the member shares another resource with the same rights, the grants of the members are replaced', async () => {
    await call(craig, 'access-authorizations.addForSingleResource', {
      resourceUri: picnicUri,
      grantee: groupWebId,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    await waitForExpect(async () => {
      const authorizations = await getGroupAuthorizations();
      expect(authorizations).toHaveLength(1);
      expect(arrayOf(authorizations[0]['interop:hasDataInstance']).sort()).toEqual([eventUri, picnicUri].sort());
    });

    await waitForExpect(async () => {
      const expected = { instances: [eventUri, picnicUri].sort(), modes: ['acl:Read'] };
      await expect(getGrantsByInstances()).resolves.toEqual({ [alice.id]: expected, [daisy.id]: expected });
    });

    await waitForExpect(async () => {
      for (const actor of [alice, daisy]) {
        await expect(hasRights(actor, picnicUri, { read: true })).resolves.toMatchObject({ read: true });
        await expect(hasRights(actor, eventUri, { read: true })).resolves.toMatchObject({ read: true });
      }
    });
  });

  test('If the member changes the rights on a resource, the grants of the members are changed', async () => {
    await call(craig, 'access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: groupWebId,
      accessModes: ['acl:Read', 'acl:Write'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    await waitForExpect(async () => {
      const authorizations = await getGroupAuthorizations();
      expect(
        authorizations.map((a: any) => [arrayOf(a['interop:hasDataInstance']), arrayOf(a['interop:accessMode']).sort()])
      ).toEqual(
        expect.arrayContaining([
          [[picnicUri], ['acl:Read']],
          [[eventUri], ['acl:Read', 'acl:Write']]
        ])
      );
      expect(authorizations).toHaveLength(2);
    });

    await waitForExpect(async () => {
      const delegatedGrants = await getDelegatedGrants();
      expect(delegatedGrants).toHaveLength(4);
    });

    await waitForExpect(async () => {
      for (const actor of [alice, daisy]) {
        await expect(hasRights(actor, eventUri, { read: true, write: true })).resolves.toMatchObject({
          read: true,
          write: true
        });
        await expect(hasRights(actor, picnicUri, { read: true, write: true })).resolves.toMatchObject({
          read: true,
          write: false
        });
      }
    });
  });

  test('If the member stops sharing a resource, the members lose access to it', async () => {
    await call(craig, 'access-authorizations.removeForSingleResource', {
      resourceUri: eventUri,
      grantee: groupWebId
    });

    await waitForExpect(async () => {
      const authorizations = await getGroupAuthorizations();
      expect(authorizations).toHaveLength(1);
      expect(authorizations[0]['interop:hasDataInstance']).toBe(picnicUri);
    });

    await waitForExpect(async () => {
      const expected = { instances: [picnicUri], modes: ['acl:Read'] };
      await expect(getGrantsByInstances()).resolves.toEqual({ [alice.id]: expected, [daisy.id]: expected });
    });

    await waitForExpect(async () => {
      for (const actor of [alice, daisy]) {
        await expect(hasRights(actor, eventUri, { read: true })).resolves.toMatchObject({ read: false });
        await expect(hasRights(actor, picnicUri, { read: true })).resolves.toMatchObject({ read: true });
      }
    });
  });
});
