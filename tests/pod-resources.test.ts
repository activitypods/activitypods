import waitForExpect from 'wait-for-expect';
import rdf from '@rdfjs/data-model';
import { ServiceBroker } from 'moleculer';
import { connectPodProvider, clearAllData, initializeAppServer, installApp, createAccount } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';

jest.setTimeout(80000);

describe('Test Pod resources handling', () => {
  let podProvider: ServiceBroker,
    alice: any,
    bob: any,
    app: any,
    aliceEventsContainerUri: string,
    bobEventsContainerUri: string,
    bobNotesContainerUri: string,
    aliceEventUri: string,
    bobEventUri: string,
    bobNoteUri: string;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    alice = await createAccount(podProvider, 'alice');
    bob = await createAccount(podProvider, 'bob');

    app = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);

    await installApp(alice, app.id);
    await installApp(bob, app.id);
  }, 120000);

  afterAll(async () => {
    await app.stop();
    await podProvider.stop();
  });

  test('Get local data through app', async () => {
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      aliceEventsContainerUri = await alice.call('ldp.registry.getUri', { type: 'as:Event', isContainer: true });
      expect(aliceEventsContainerUri).not.toBeUndefined();
    });

    aliceEventUri = await alice.call('ldp.container.post', {
      containerUri: aliceEventsContainerUri,
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      }
    });

    await expect(
      app.call('pod-resources.get', {
        resourceUri: aliceEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Birthday party !'
      }
    });
  });

  test('Get remote data through app', async () => {
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      bobEventsContainerUri = await bob.call('ldp.registry.getUri', { type: 'as:Event', isContainer: true });
      expect(bobEventsContainerUri).not.toBeUndefined();
    });

    bobEventUri = await bob.call('ldp.container.post', {
      containerUri: bobEventsContainerUri,
      resource: {
        type: 'Event',
        name: 'Vegan barbecue'
      }
    });

    // Alice hasn't right (yet) to see Bob event
    await expect(
      app.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 403
    });

    await bob.call('webacl.resource.addRights', {
      resourceUri: bobEventUri,
      additionalRights: {
        user: {
          uri: alice.id,
          read: true
        }
      }
    });

    await expect(
      app.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Vegan barbecue'
      }
    });
  });

  test('Cannot post to non-container', async () => {
    await expect(
      app.call('pod-resources.post', {
        resource: {
          id: alice.baseUrl + '/sparql',
          hackMe: 'if you can ?'
        },
        actorUri: alice.id
      })
    ).rejects.toThrow();
  });

  test('Cannot get data not registered by app', async () => {
    await bob.call('ldp.registry.register', {
      types: 'as:Note'
    });

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      bobNotesContainerUri = await bob.call('ldp.registry.getUri', { type: 'as:Event', isContainer: true });
      expect(bobNotesContainerUri).not.toBeUndefined();
    });

    bobNoteUri = await bob.call('ldp.container.post', {
      containerUri: bobNotesContainerUri,
      resource: {
        type: 'Note',
        name: 'Note to myself'
      }
    });

    await bob.call('webacl.resource.addRights', {
      resourceUri: bobNoteUri,
      additionalRights: {
        user: {
          uri: alice.id,
          read: true
        }
      }
    });

    // Bob's note is shared with Alice, but the app has not registered as:Note
    await expect(
      app.call('pod-resources.get', {
        resourceUri: bobNoteUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({ status: 403 });
  });

  test('PUT data registered by app', async () => {
    await bob.call('webacl.resource.addRights', {
      resourceUri: bobEventUri,
      additionalRights: {
        user: {
          uri: alice.id,
          write: true
        }
      }
    });

    await expect(
      app.call('pod-resources.put', {
        resource: {
          id: bobEventUri,
          type: 'Event',
          name: 'Vegan (and vegetarian) barbecue'
        },
        actorUri: alice.id
      })
    ).resolves.not.toThrow();

    await expect(
      app.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Vegan (and vegetarian) barbecue'
      }
    });
  });

  test('Cannot PUT data not registered by app', async () => {
    await bob.call('webacl.resource.addRights', {
      resourceUri: bobNoteUri,
      additionalRights: {
        user: {
          uri: alice.id,
          write: true
        }
      }
    });

    // Bob gave write permission to Alice, but the app has not registered as:Note
    await expect(
      app.call('pod-resources.put', {
        resource: {
          id: bobNoteUri,
          type: 'Note',
          name: 'Note to myself... and my friends !'
        },
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 403
    });
  });

  test('PATCH data registered by app', async () => {
    await expect(
      app.call('pod-resources.patch', {
        resourceUri: bobEventUri,
        triplesToAdd: [
          rdf.quad(
            rdf.namedNode(bobEventUri),
            rdf.namedNode('https://www.w3.org/ns/activitystreams#summary'),
            rdf.literal('A super-powerful AI-generated summary')
          )
        ],
        actorUri: alice.id
      })
    ).resolves.not.toThrow();

    await expect(
      app.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Vegan (and vegetarian) barbecue',
        summary: 'A super-powerful AI-generated summary'
      }
    });
  });

  test('DELETE data registered by app', async () => {
    // Alice has write permission on Bob's event
    await expect(
      app.call('pod-resources.delete', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 204
    });

    await expect(
      app.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Tombstone',
        formerType: 'as:Event'
      }
    });
  });
});
