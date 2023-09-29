const CapabilitiesService = require('@activitypods/core/services/capabilities');
const { delay } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const path = require('path');
const fetch = require('node-fetch');
const waitForExpect = require('wait-for-expect');
const { arrayOf, waitForResource } = require('./utils');
const { initialize, listDatasets, clearDataset } = require('./initialize');

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
    predicates: ['url']
  });

  const capabilitiesUri = await broker.call('capabilities.getContainerUri', { webId });

  return { webId, profileUri: webIdDoc['url'], capabilitiesUri, token };
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
      cap.type === 'acl:Authorization' && cap['acl:Mode'] === 'acl:Read' && cap['acl:AccessTo'] === user.profileUri
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

    await broker.start();

    const newUserPromises = [];
    for (let i = 1; i <= NUM_USERS; i++) {
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
      // Make an authenticated fetch for user1.
      const fetchRes = await fetch(users[0].capabilitiesUri, {
        headers: { authorization: `Bearer ${users[0].token}` }
      });
      const jsonRes = await fetchRes.json();
      const caps = jsonRes['ldp:contains'];
      expect(arrayOf(caps)).toHaveLength(1);
    });

    test('anonymous user sees empty container', async () => {
      const fetchRes = await fetch(users[0].capabilitiesUri);
      const jsonRes = await fetchRes.json();
      const caps = jsonRes['ldp:contains'];
      expect(arrayOf(caps)).toHaveLength(0);
    });

    test('other user sees empty container', async () => {
      // Make an authenticated fetch for user1, fetching user0's caps.
      const fetchRes = await fetch(users[0].capabilitiesUri, {
        headers: { authorization: `Bearer ${users[1].token}` }
      });
      const jsonRes = await fetchRes.json();
      const caps = jsonRes['ldp:contains'];
      expect(arrayOf(caps)).toHaveLength(0);
    });
    3;
  });

  test('migration to add invite URI capabilities', async () => {
    // For this test, we create a third user (without adding new capabilities),
    //  to emulate the pre-migration behavior.
    // 1. Stop capabilities service (that adds an invite capability on signup).
    await broker.destroyService('capabilities');

    // 2. Create user.
    const newUser = await signupUser(NUM_USERS + 1);
    const webIdDoc = await broker.call('ldp.resource.awaitCreateComplete', {
      resourceUri: newUser.webId,
      predicates: ['url']
    });
    newUser.profileUri = webIdDoc['url'];

    // 3. Start capabilities service again.
    broker.createService(CapabilitiesService, {
      settings: { path: '/capabilities' }
    });

    // 3.1 Run migration. Will add the capabilities. Wait a bit, until the service becomes available.
    await delay(2_000);
    await broker.call('capabilities.addCapsContainersWhereMissing', {});

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

  test.skip('resource is accessible with capability token', async () => {
    // TODO
  });

  test.skip('resource is not accessible without capability token', async () => {
    // TODO
  });
});
