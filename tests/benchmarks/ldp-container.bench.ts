import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from '../initialize.ts';
import { BenchmarkReport, envNumber, runWithConcurrency } from './utils.ts';

/**
 * Benchmark of ldp.container.get on a Pod with many resources.
 *
 * Two containers are filled with NUM_RESOURCES resources each:
 * - data/benchmark/events, with local resources (permissions checked by the WebACL middleware)
 * - data/vcard/individual, with stored remote resources, like the profiles of the contacts
 *   (permissions checked by Fuseki, triple by triple)
 *
 * A third-party agent (like an app) is given read rights on both containers. The containers are then read as
 * the Pod owner, as this agent and as system, first page / deep page / whole container.
 *
 * The measures are then repeated after giving the agent NUM_EXTRA_AUTHORIZATIONS authorizations on other
 * resources, as on Pods with many grants: Fuseki's WebACL checks used to go through all the authorizations
 * of the agent for each resource.
 *
 * Settings (environment variables): BENCH_NUM_RESOURCES, BENCH_NUM_EXTRA_AUTHORIZATIONS, BENCH_PAGE_SIZE, BENCH_RUNS.
 * The Pod provider must be started in test mode, see ../README.md. Without SEMAPPS_REDIS_CACHE_URL, nothing is cached.
 */

const NUM_RESOURCES = envNumber('BENCH_NUM_RESOURCES', 1000);
const NUM_EXTRA_AUTHORIZATIONS = envNumber('BENCH_NUM_EXTRA_AUTHORIZATIONS', 2000);
const PAGE_SIZE = envNumber('BENCH_PAGE_SIZE', 10);
const CONCURRENCY = 10;
const AGENT_URI = 'https://app.example.org/app';

jest.setTimeout(3600000);

describe('Benchmark ldp.container.get', () => {
  let podProvider: any, alice: any, eventsContainerUri: string, notesContainerUri: string, profilesContainerUri: string;
  const report = new BenchmarkReport(`ldp.container.get with ${NUM_RESOURCES} resources`);

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    const actorData = require('../data/actor1.json');
    const { webId } = await podProvider.call('auth.signup', actorData);
    alice = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      { actorUri: webId },
      { meta: { dataset: actorData.username } }
    );
    alice.call = (actionName: string, params: any, options: any = {}) =>
      podProvider.call(actionName, params, {
        ...options,
        meta: { webId, dataset: actorData.username, ...options.meta }
      });

    eventsContainerUri = urlJoin(alice.id, 'data/benchmark/events');
    notesContainerUri = urlJoin(alice.id, 'data/benchmark/notes');
    profilesContainerUri = urlJoin(alice.id, 'data/vcard/individual');

    for (const containerUri of [eventsContainerUri, notesContainerUri]) {
      await alice.call('ldp.container.createAndAttach', { containerUri, webId: alice.id });
    }

    await runWithConcurrency([...Array(NUM_RESOURCES).keys()], CONCURRENCY, async i => {
      await alice.call(
        'ldp.container.post',
        {
          containerUri: eventsContainerUri,
          resource: {
            type: 'Event',
            name: `Event ${i}`,
            content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
            location: { type: 'Place', name: `Place ${i}` }
          },
          contentType: MIME_TYPES.JSON
        },
        { meta: { skipObjectsWatcher: true } }
      );
    });

    await runWithConcurrency([...Array(NUM_RESOURCES).keys()], CONCURRENCY, async i => {
      const resourceUri = `https://remote.example.org/user${i}/data/vcard/individual/profile`;
      await alice.call(
        'ldp.remote.store',
        {
          resource: {
            '@context': ['https://www.w3.org/ns/activitystreams', { vcard: 'http://www.w3.org/2006/vcard/ns#' }],
            id: resourceUri,
            type: ['vcard:Individual', 'Profile'],
            'vcard:fn': `Contact ${i}`,
            'vcard:hasAddress': { type: 'vcard:Address', 'vcard:locality': `Town ${i}` },
            describes: `https://remote.example.org/user${i}`
          },
          webId: alice.id
        },
        { meta: { skipEmitEvent: true } }
      );
      await alice.call('ldp.container.attach', { containerUri: profilesContainerUri, resourceUri });
    });

    for (const containerUri of [eventsContainerUri, profilesContainerUri]) {
      await alice.call('webacl.resource.addRights', {
        resourceUri: containerUri,
        additionalRights: {
          user: { uri: AGENT_URI, read: true },
          default: { user: { uri: AGENT_URI, read: true } }
        },
        webId: 'system'
      });
    }
  });

  afterAll(async () => {
    report.print();
    await podProvider.stop();
  });

  const measureContainers = async (suffix = '') => {
    const lastPage = Math.ceil(NUM_RESOURCES / PAGE_SIZE);
    for (const [containerName, containerUri] of [
      ['events (local)', eventsContainerUri],
      ['profiles (stored remote)', profilesContainerUri]
    ]) {
      const readers = [
        ['owner', alice.id],
        ['agent', AGENT_URI]
      ];
      // In Pod provider config, stored remote resources can't be read as system (ldp.remote.get goes to the network)
      if (containerUri !== profilesContainerUri) readers.push(['system', 'system']);
      for (const [readerName, webId] of readers) {
        for (const [pageName, params] of [
          ['first page', { maxPerPage: PAGE_SIZE, page: 1 }],
          ['last page', { maxPerPage: PAGE_SIZE, page: lastPage }],
          ['whole container', {}]
        ]) {
          await report.measure(
            `${containerName} / ${readerName} / ${pageName}${suffix}`,
            () =>
              alice.call(
                'ldp.container.get',
                { containerUri, accept: MIME_TYPES.JSON, ...(params as object) },
                { meta: { webId } }
              ),
            result => ({ items: result['ldp:contains']?.length ?? 0 })
          );
        }
      }
    }
  };

  test('Read the containers', async () => {
    await measureContainers();
  });

  test(`Read the containers with ${NUM_EXTRA_AUTHORIZATIONS} more authorizations for the agent`, async () => {
    // Give the agent read rights on new resources, one authorization per resource
    await runWithConcurrency([...Array(NUM_EXTRA_AUTHORIZATIONS).keys()], CONCURRENCY, async i => {
      const resourceUri = await alice.call(
        'ldp.container.post',
        {
          containerUri: notesContainerUri,
          resource: { type: 'Note', content: `Note ${i}` },
          contentType: MIME_TYPES.JSON
        },
        { meta: { skipObjectsWatcher: true } }
      );
      await alice.call('webacl.resource.addRights', {
        resourceUri,
        additionalRights: { user: { uri: AGENT_URI, read: true } },
        webId: 'system'
      });
    });

    await measureContainers(` (+${NUM_EXTRA_AUTHORIZATIONS} auth.)`);
  });
});
