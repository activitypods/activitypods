const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { connectPodProvider, clearAllData } = require('./initialize');
const ExampleAppService = require('./apps/example.app');
const { arrayOf } = require('@semapps/ldp');

jest.setTimeout(80000);

const NUM_PODS = 3;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test resource sharing features', () => {
  let actors = [],
    podProvider,
    alice,
    bob,
    craig,
    eventUri;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];

    await installApp(alice, APP_URI);
  });

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice creates an event', async () => {
    eventUri = await alice.call('ldp.container.post', {
      containerUri: alice.id + '/data/as/event',
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!'
      },
      contentType: MIME_TYPES.JSON
    });
  });

  test('Alice share her event with Bob', async () => {
    await alice.call('social-agent-registrations.addAuthorization', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read']
    });

    await waitForExpect(async () => {
      const filteredContainer = await alice.call('social-agent-registrations.list', {
        filters: {
          'http://www.w3.org/ns/solid/interop#registeredAgent': bob.id
        }
      });
      expect(arrayOf(filteredContainer['ldp:contains'])).toHaveLength(1);
      expect(arrayOf(filteredContainer['ldp:contains'])[0]).toMatch({
        'interop:registeredAgent': bob.id,
        'interop:registeredBy': alice.id
      });
    });
  });
});
