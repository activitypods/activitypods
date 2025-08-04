// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example.app.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import Example2AppService from './apps/example2.app.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(100000);
const NUM_PODS = 1;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');
const APP2_SERVER_BASE_URL = 'http://localhost:3002';
const APP2_URI = urlJoin(APP2_SERVER_BASE_URL, 'app');

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test Pod resources handling', () => {
  let actors: any = [],
    podProvider: any,
    alice: any,
    appServer: any,
    app2Server: any,
    eventUri: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    app2Server = await initializeAppServer(3002, 'app2Data', 'app2_settings', 2, Example2AppService);
    await app2Server.start();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName: any, params: any, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          // @ts-expect-error TS(2339): Property 'meta' does not exist on type '{}'.
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];

    await installApp(alice, APP_URI);
    await installApp(alice, APP2_URI);
  }, 100000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Add permission with acl:Control permission', async () => {
    eventUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/event'),
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      },
      contentType: MIME_TYPES.JSON
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/bob',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-permissions.get', {
        uri: eventUri,
        actorUri: alice.id
      })
    ).resolves.toContainEqual(
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect.objectContaining({
        '@id': '#Read',
        '@type': 'acl:Authorization',
        'acl:accessTo': eventUri,
        'acl:agent': 'http://localhost:3000/bob',
        'acl:mode': 'acl:Read'
      })
    );
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Add permission without acl:Control permission', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      app2Server.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeFalsy();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Remove permission', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-permissions.add', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-permissions.remove', {
        uri: eventUri,
        agentUri: 'http://localhost:3000/craig',
        agentPredicate: 'acl:agent',
        mode: 'acl:Read',
        actorUri: alice.id
      })
    ).resolves.toBeTruthy();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-permissions.get', {
        uri: eventUri,
        actorUri: alice.id
      })
    ).resolves.toContainEqual(
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect.objectContaining({
        '@id': '#Read',
        '@type': 'acl:Authorization',
        'acl:accessTo': eventUri,
        'acl:agent': 'http://localhost:3000/bob',
        'acl:mode': 'acl:Read'
      })
    );
  });
});
