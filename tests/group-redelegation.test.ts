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
    groupWebId: string,
    memberRoleUri: string,
    eventUri: string,
    privateEventUri: string;

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
    for (const actor of [bob, craig]) {
      await podProvider.call('role-registrations.addMember', {
        roleRegistrationUri: memberRoleUri,
        agentUri: actor.id
      });
    }

    eventUri = await createEvent('General assembly');
    privateEventUri = await createEvent('Birthday party');
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
});
