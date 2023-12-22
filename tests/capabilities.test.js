const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const path = require('path');
const fetch = require('node-fetch');
const waitForExpect = require('wait-for-expect');
const { arrayOf, waitForResource } = require('./utils');
const { initialize, listDatasets, clearDataset } = require('./initialize');
const CapabilitiesProfileService = require('../packages/profiles/services/capabilities-profile');

/**
 * @typedef {import('moleculer').ServiceBroker} Broker
 */

jest.setTimeout(30_000);

const NUM_USERS = 2;

/** @type {Broker} */
let broker;

const signupUser = async num => {
  const { webId, token } = await broker.call('auth.signup', {
    username: `user${num}`,
    email: `user${num}@test.com`,
    password: 'test',
    name: `User #${num}`
  });
  return { webId, token };
};

/** @param {Broker} broker @param {number} num */
const createUser = async (broker, num) => {
  const { webId, token } = await signupUser(num);

  const webIdDoc = await broker.call('ldp.resource.awaitCreateComplete', {
    resourceUri: webId,
    predicates: ['url', 'apods:contacts']
  });

  const capabilitiesUri = await broker.call('capabilities.getContainerUri', { webId });

  return { ...webIdDoc, webId, profileUri: webIdDoc.url, capabilitiesUri, token };
};

const getUserInviteCap = async user => {
  // Get all existing caps
  const inviteCaps = await broker.call(
    'ldp.container.get',
    {
      containerUri: user.capabilitiesUri,
      accept: MIME_TYPES.JSON,
      webId: 'system'
    },

    { meta: { $cache: false } }
  );
  const caps = arrayOf(inviteCaps['ldp:contains']);
  const inviteCap = caps.find(cap => {
    return (
      cap.type === 'acl:Authorization' && cap['acl:mode'] === 'acl:Read' && cap['acl:accessTo'] === user.profileUri
    );
  });
  return inviteCap;
};

describe('capabilities', () => {
  /**
   * @typedef UserField
   * @property {string} webId
   * @property {string} profileUri
   * @property {string} capabilitiesUri
   * @property {string} token
   */
  /** @type {UserField[]} */
  let users = [];

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    broker = await initialize(3000, 'settings');

    broker.loadService(path.resolve(__dirname, './services/profiles.app.js'));
    broker.loadService(path.resolve(__dirname, './services/contacts.app.js'));

    await broker.start();

    const newUserPromises = [];
    for (let i = 0; i < NUM_USERS; i += 1) {
      newUserPromises.push(createUser(broker, i));
    }

    users = await Promise.all(newUserPromises);

    // We still need to wait here, signup hooks might not have completed (i.e. invite caps not set).
    await waitForExpect(
      async () => {
        for (const user of users) {
          expect(await getUserInviteCap(user)).toBeTruthy();
        }
      },
      { timeout: 7000, interval: 100 }
    );
  });

  afterAll(async () => {
    await broker.stop();
  });

  describe('profile read (invite)', () => {
    test('is present', async () => {
      const inviteCap = await getUserInviteCap(users[0]);
      expect(inviteCap).toBeTruthy();
    });

    test('is accessible for anonymous users by URI', async () => {
      const inviteCap = await getUserInviteCap(users[0]);

      const fetchRes = await fetch(inviteCap.id, { headers: { accept: MIME_TYPES.JSON } });
      expect(fetchRes.ok).toBeTruthy();

      const fetchedCap = await fetchRes.json();
      expect(fetchedCap).toMatchObject(inviteCap);
    });
  });

  describe('container access is restricted', () => {
    test('owner can GET capability container resources', async () => {
      // Make an authenticated fetch for user0.
      const fetchRes = await fetch(users[0].capabilitiesUri, {
        headers: { authorization: `Bearer ${users[0].token}` }
      });
      const jsonRes = await fetchRes.json();
      const caps = jsonRes['ldp:contains'];
      expect(arrayOf(caps)).toHaveLength(1);
    });

    test('anonymous user cannot get container', async () => {
      const { status } = await fetch(users[0].capabilitiesUri);
      expect(status).toBe(404);
    });

    test('other user cannot get container', async () => {
      // Make an authenticated fetch for user0, fetching user0's caps.
      const { status } = await fetch(users[0].capabilitiesUri, {
        headers: { Authorization: `Bearer ${users[1].token}` }
      });
      expect(status).toBe(404);
    });
  });

  test('migration to add invite URI capabilities', async () => {
    // For this test, we create a third user (without adding new capabilities),
    //  to emulate the pre-migration behavior.
    // 1. Stop capabilities service (that adds an invite capability on signup).
    await broker.destroyService('profiles.capabilities');

    // 2. Create user 3.
    const newUser = await signupUser(NUM_USERS + 1);
    const webIdDoc = await broker.call('ldp.resource.awaitCreateComplete', {
      resourceUri: newUser.webId,
      predicates: ['url']
    });
    newUser.profileUri = webIdDoc.url;

    // 3. Start capabilities service again.
    broker.createService(CapabilitiesProfileService);

    await broker.waitForServices('profiles.capabilities', 4_000);
    // 3.1 Run migration. Will add the capabilities. Wait until the service becomes available.
    await broker.waitForServices('capabilities', 4_000);
    await broker.call('profiles.capabilities.addCapsContainersWhereMissing');

    // 4. Get the capabilities and assert them.
    // 4.1. Add the missing properties to the actor object (required by `getActorInviteCap`).
    newUser.capabilitiesUri = await broker.call('capabilities.getContainerUri', { webId: newUser.webId });

    // 4.2. Get the added capabilities for the new user.
    const inviteCap = await waitForResource(200, undefined, 15, () => getUserInviteCap(newUser));
    // 4.3. Invite capability should be available.
    expect(inviteCap).toBeTruthy();

    // 5. Assert, that other users did not get more caps.
    for (let i = 0; i < NUM_USERS; i += 1) {
      const inviteCaps = await broker.call('ldp.container.get', {
        containerUri: users[i].capabilitiesUri,
        accept: MIME_TYPES.JSON,
        webId: 'system'
      });
      const userCaps = arrayOf(inviteCaps['ldp:contains']);
      expect(userCaps).toHaveLength(1);
    }
  });

  test('resource is accessible with capability token', async () => {
    const inviteCap = await getUserInviteCap(users[0]);
    const fetchedProfile = await fetch(users[0].profileUri, {
      headers: { authorization: `Capability ${inviteCap.id}` }
    });

    expect(fetchedProfile.ok).toBeTruthy();
    const fetchedProfileJson = await fetchedProfile.json();
    expect(fetchedProfileJson).toMatchObject({
      id: users[0].profileUri
    });
  });

  test('resource is not accessible with wrong capability token', async () => {
    const inviteCap = await getUserInviteCap(users[0]);
    const fetchedProfile = await fetch(users[1].profileUri, {
      headers: { authorization: `Capability ${inviteCap.id}` }
    });
    expect(fetchedProfile.ok).toBeFalsy();
  });

  test('resource is not accessible with misplaced capability token', async () => {
    const misplacedCapUri = await broker.call('profiles.profile.post', {
      resource: {
        type: 'acl:Authorization',
        'acl:mode': 'acl:Read',
        'acl:accessTo': users[0].profileUri
      },
      contentType: MIME_TYPES.JSON,
      webId: users[0].webId
    });
    const fetchedProfile = await fetch(users[0].profileUri, {
      headers: { authorization: `Capability ${misplacedCapUri}` }
    });

    expect(fetchedProfile.ok).toBeFalsy();
  });

  test('resource is not accessible with wrong capability acl:accessTo', async () => {
    const capUri = await broker.call('capabilities.post', {
      resource: {
        type: 'acl:Authorization',
        'acl:mode': 'acl:Read',
        'acl:accessTo': 'https://path-to-different-resource.example'
      },
      contentType: MIME_TYPES.JSON,
      webId: users[0].webId
    });
    const fetchedProfile = await fetch(users[0].profileUri, {
      headers: { authorization: `Capability ${capUri}` }
    });

    expect(fetchedProfile.ok).toBeFalsy();
  });

  test('resource is not accessible without capability token', async () => {
    const fetchedProfile = await fetch(users[0].profileUri);
    expect(fetchedProfile.ok).toBeFalsy();
  });

  test('resource is not accessible without invalid capability URI', async () => {
    const fetchedProfile = await fetch(users[1].profileUri, {
      headers: { authorization: `Capability not-a-uri ha` }
    });
    expect(fetchedProfile.ok).toBeFalsy();
  });

  test('resource is not accessible with non-existing capability', async () => {
    const inviteCap = await getUserInviteCap(users[0]);
    const fetchedProfile = await fetch(users[1].profileUri, {
      headers: { authorization: `Capability ${inviteCap.id}-some-more-chars` }
    });
    expect(fetchedProfile.ok).toBeFalsy();
  });

  test('posting to inbox with cap token accepts invite automatically', async () => {
    // user0 sends invite to user1
    const inviteCap = await getUserInviteCap(users[1]);
    const postRes = await fetch(users[0].outbox, {
      method: 'POST',
      headers: { authorization: `Bearer ${users[0].token}`, 'Content-Type': MIME_TYPES.JSON },
      body: JSON.stringify({
        '@context': 'https://activitypods.org/context.json',
        type: ACTIVITY_TYPES.OFFER,
        actor: users[0].webId,
        to: users[1].webId,
        target: users[1].webId,
        object: {
          type: ACTIVITY_TYPES.ADD,
          object: users[0].profileUri
        },
        'sec:capability': inviteCap.id
      })
    });

    expect(postRes.ok).toBeTruthy();

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: users[1]['apods:contacts'],
          itemUri: users[0].webId
        })
      ).resolves.toBeTruthy();
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: users[0]['apods:contacts'],
          itemUri: users[1].webId
        })
      ).resolves.toBeTruthy();
    });
  });
});
