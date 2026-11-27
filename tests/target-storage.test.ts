import http from 'http';
import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { generateDocuments } from '../app-framework/app-manifest/src/generate.ts';
import { arrayOf } from './utils.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(120000);

const APP_URL = 'http://localhost:3003/';
const APP_URI = urlJoin(APP_URL, 'app.json');
const EVENT_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event');
const PROFILE_SHAPE_TREE = urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Profile');

const manifest = {
  name: 'Calendar',
  description: 'A calendar stored in a group',
  accessNeeds: {
    '@user': {
      required: [{ shapeTreeUri: PROFILE_SHAPE_TREE, accessMode: 'acl:Read' }, 'apods:PostOutbox' as const]
    },
    calendar: {
      required: [
        { shapeTreeUri: EVENT_SHAPE_TREE, accessMode: ['acl:Read', 'acl:Write'] },
        'apods:ReadInbox' as const,
        'apods:PostOutbox' as const
      ]
    }
  }
};

describe('Access needs targeting the storage of a group', () => {
  let podProvider: any, appServer: http.Server, alice: any, bob: any, craig: any, groupWebId: string;
  let storages: Record<string, string> = {};

  const call = (actor: any, actionName: string, params: any = {}) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id, dataset: actor.preferredUsername } });

  const getAuthorizations = (webId: string, dataset: string) =>
    podProvider.call('access-authorizations.listByGrantee', { grantee: APP_URI, webId }, { meta: { webId, dataset } });

  const getSpecialRights = async (webId: string, dataset: string) => {
    const registration = await podProvider.call(
      'app-registrations.getForAgent',
      { agentUri: APP_URI, podOwner: webId },
      { meta: { webId, dataset } }
    );
    return arrayOf(registration['apods:hasSpecialRights']);
  };

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = http.createServer((req, res) => {
      const document = generateDocuments(manifest, APP_URL, { storages })[req.url!.slice(1)];
      if (!document) {
        res.writeHead(404).end();
      } else {
        res.writeHead(200, { 'Content-Type': MIME_TYPES.JSON }).end(JSON.stringify(document));
      }
    });
    await new Promise<void>(resolve => appServer.listen(3003, resolve));

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
    const group = await podProvider.call(
      'ldp.resource.get',
      { resourceUri: groupWebId, accept: MIME_TYPES.JSON, webId: 'system' },
      { meta: { dataset: 'acme' } }
    );
    storages = { calendar: group['pim:storage'] };

    await podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' }),
      agentUri: bob.id
    });
  }, 120000);

  afterAll(async () => {
    await new Promise(resolve => appServer.close(resolve));
    await podProvider.stop();
  });

  test('The group only accepts the needs targeting its storage', async () => {
    await call(alice, 'registration-endpoint.register', {
      appUri: APP_URI,
      podOwner: groupWebId,
      acceptAllRequirements: true
    });

    const authorizations = await getAuthorizations(groupWebId, 'acme');
    expect(authorizations.map((a: any) => a['interop:registeredShapeTree'])).toEqual([EVENT_SHAPE_TREE]);
    expect((await getSpecialRights(groupWebId, 'acme')).sort()).toEqual(['apods:PostOutbox', 'apods:ReadInbox']);
  });

  test('A member is only asked for the needs on their own Pod', async () => {
    await call(bob, 'registration-endpoint.register', { appUri: APP_URI, acceptAllRequirements: true });

    const authorizations = await getAuthorizations(bob.id, bob.preferredUsername);
    expect(authorizations).toHaveLength(2);
    expect(authorizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'interop:dataOwner': bob.id,
          'interop:registeredShapeTree': PROFILE_SHAPE_TREE
        }),
        expect.objectContaining({
          'interop:dataOwner': groupWebId,
          'interop:registeredShapeTree': EVENT_SHAPE_TREE,
          'interop:scopeOfAuthorization': 'interop:AllFromRegistry'
        })
      ])
    );
    expect(await getSpecialRights(bob.id, bob.preferredUsername)).toEqual(['apods:PostOutbox']);
  });

  test('A non-member can register the app, without access to the group', async () => {
    await call(craig, 'registration-endpoint.register', { appUri: APP_URI, acceptAllRequirements: true });

    const authorizations = await getAuthorizations(craig.id, craig.preferredUsername);
    expect(authorizations.map((a: any) => a['interop:registeredShapeTree'])).toEqual([PROFILE_SHAPE_TREE]);
  });

  test('The needs accepted by the user are limited to their own Pod', async () => {
    await call(craig, 'registration-endpoint.remove', { appUri: APP_URI });

    const app = generateDocuments(manifest, APP_URL, { storages }) as any;
    const allNeeds = Object.values(app)
      .filter((document: any) => document.type === 'interop:AccessNeed')
      .map((document: any) => document.id);
    await call(craig, 'registration-endpoint.register', {
      appUri: APP_URI,
      acceptedAccessNeeds: allNeeds,
      acceptedSpecialRights: ['apods:PostOutbox', 'apods:ReadInbox']
    });

    const authorizations = await getAuthorizations(craig.id, craig.preferredUsername);
    expect(authorizations.map((a: any) => a['interop:registeredShapeTree'])).toEqual([PROFILE_SHAPE_TREE]);
    expect(await getSpecialRights(craig.id, craig.preferredUsername)).toEqual(['apods:PostOutbox']);
  });

  test('An upgrade is needed when the user becomes member of the group', async () => {
    await expect(call(craig, 'app-status.get', { appUri: APP_URI })).resolves.toMatchObject({ upgradeNeeded: false });

    await podProvider.call('role-registrations.addMember', {
      roleRegistrationUri: await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' }),
      agentUri: craig.id
    });
    await expect(call(craig, 'app-status.get', { appUri: APP_URI })).resolves.toMatchObject({ upgradeNeeded: true });

    await call(craig, 'registration-endpoint.upgrade', { appUri: APP_URI, acceptAllRequirements: true });

    const authorizations = await getAuthorizations(craig.id, craig.preferredUsername);
    expect(authorizations).toContainEqual(
      expect.objectContaining({ 'interop:dataOwner': groupWebId, 'interop:registeredShapeTree': EVENT_SHAPE_TREE })
    );
    await expect(call(craig, 'app-status.get', { appUri: APP_URI })).resolves.toMatchObject({ upgradeNeeded: false });
  });
});
