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
jest.setTimeout(30000);

const NUM_USERS = 2;

/** @type {Broker} */
let broker;

const signupUser = async (num) => {
  const { webId, token } = await broker.call('auth.signup', {
    username: `user${num}`,
    email: `user${num}@test.com`,
    password: 'test',
    name: `User #${num}`,
  });
  return { webId, token };
};

/** @param {Broker} broker @param {number} num */
const createUser = async (broker, num) => {
  const { webId, token } = await signupUser(num);

  const webIdDoc = await waitForResource(
    2000,
    ['url', 'apods:capabilities'],
    8,
    async () =>
      await broker.call('ldp.resource.get', {
        resourceUri: webId,
        accept: MIME_TYPES.JSON,
        webId: 'system',
      })
  );

  // The .id check is only necessary as long as the @context is not updated to contain `apods:capabilities`
  const capsUri =
    typeof webIdDoc['apods:capabilities'] === 'string'
      ? webIdDoc['apods:capabilities']
      : webIdDoc['apods:capabilities'].id;

  return { uri: webId, profileUri: webIdDoc['url'], capabilitiesUri: capsUri, token };
};

const getUserInviteCap = async (user) => {
  // Get all existing caps
  const inviteCaps = await broker.call('ldp.container.get', {
    containerUri: user.capabilitiesUri,
    accept: MIME_TYPES.JSON,
    webId: 'system',
  });
  const caps = arrayOf(inviteCaps['ldp:contains']);
  const inviteCap = caps.find((cap) => {
    return (
      cap.type === 'http://www.w3.org/ns/auth/acl#Authorization' &&
      cap['http://www.w3.org/ns/auth/acl#Mode'] === 'http://www.w3.org/ns/auth/acl#Read' &&
      cap['http://www.w3.org/ns/auth/acl#AccessTo'] === user.profileUri
    );
  });
  return inviteCap;
};

describe('capabilities', () => {
  /**
   * @typedef UserField
   * @property {string} uri
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
    waitForExpect(
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
        headers: { authorization: `Bearer ${users[0].token}` },
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
        headers: { authorization: `Bearer ${users[1].token}` },
      });
      const jsonRes = await fetchRes.json();
      const caps = jsonRes['ldp:contains'];
      expect(arrayOf(caps)).toHaveLength(0);
    });
  });

  test('migration to add invite URI capabilities', async () => {
    // For this test, we create a third user (without adding new capabilities),
    //  to emulate the pre-migration behavior.
    // 1. Stop capabilities service (that defines capabilities on signup).
    await broker.destroyService('capabilities');

    // 2. Create user.
    const newUser = await signupUser(3);

    // 2.1 We use this, to get the profile URI.
    const webIdDoc = await waitForResource(
      2000,
      ['url'],
      8,
      async () =>
        await broker.call('ldp.resource.get', {
          resourceUri: newUser.webId,
          accept: MIME_TYPES.JSON,
          webId: 'system',
        })
    );
    // 2.2 Since the capabilities service is disabled, no reference should be created.
    expect(webIdDoc['apods:capabilities']).toBeUndefined();

    // 3. Start capabilities service again.
    broker.createService(CapabilitiesService, {
      settings: { path: '/capabilities' },
    });

    // 3.1 Run migration. Will add the capabilities. Wait a bit, until the service becomes available.
    await delay(2000);
    await broker.call('capabilities.addCapsContainersWhereMissing', {});

    // 4. Get the capabilities and assert them.
    // 4.1 Get the capabilities URI from the webId document that should have been added.
    const webIdDocNew = await waitForResource(
      2000,
      ['apods:capabilities'],
      8,
      async () =>
        await broker.call('ldp.resource.get', {
          resourceUri: newUser.webId,
          accept: MIME_TYPES.JSON,
          webId: 'system',
        })
    );

    // 4.1.1 Add the missing properties to the actor object (required by `getActorInviteCap`).
    newUser.profileUri = webIdDocNew['url'];
    newUser.capabilitiesUri = webIdDocNew['apods:capabilities']?.id || webIdDocNew['apods:capabilities'];

    // 4.2. The capabilities should be available now, get them.
    const inviteCapAgain = getUserInviteCap(newUser);
    // 4.3. Invite capability should be available.
    expect(inviteCapAgain).toBeTruthy();

    // 5. Assert, that other users did not get more caps.
    const inviteCaps = await broker.call('ldp.container.get', {
      containerUri: users[0].capabilitiesUri,
      accept: MIME_TYPES.JSON,
      webId: 'system',
    });
    const user0Caps = arrayOf(inviteCaps['ldp:contains']);
    expect(user0Caps).toHaveLength(1);
  });

  test.skip('resource is accessible with capability token', async () => {
    // TODO
  });

  test.skip('resource is not accessible without capability token', async () => {
    // TODO
  });
});
