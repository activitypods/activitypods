import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { arrayOf } from '@semapps/ldp';

import { connectPodProvider, clearAllData, createActor, initializeAppServer, installApp } from './initialize.ts';

import ExampleAppService from './apps/example3.app.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(120000);
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test delegation features', () => {
  let podProvider: any,
    appServer: any,
    alice: any,
    bob: any,
    craig: any,
    eventContainerUri: any,
    eventUri: any,
    secondEventUri: any,
    craigAppRegistrationUri: any;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');

    // We only need to install the app for Craig
    craigAppRegistrationUri = await installApp(craig, APP_URI);
  });

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Alice creates an event and gives delegation right to Bob', async () => {
    // Create container manually so that we don't need to install the app
    eventContainerUri = await alice.call('data-registrations.generateFromShapeTree', {
      shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL!, 'shapetrees/as/Event'),
      podOwner: alice.id
    });

    eventUri = await alice.call('ldp.container.post', {
      containerUri: eventContainerUri,
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!'
      },
      contentType: MIME_TYPES.JSON
    });

    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    // An authorization is created with the delegation information
    await waitForExpect(async () => {
      const authorizations = await alice.call('access-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(authorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:grantedBy': alice.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // A grant is created with the delegation information
    await waitForExpect(async () => {
      const bobRegistration = await alice.call('social-agent-registrations.getForAgent', {
        agentUri: bob.id,
        podOwner: alice.id
      });

      await expect(
        alice.call('social-agent-registrations.getGrants', {
          agentRegistration: bobRegistration,
          podOwner: alice.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:grantedBy': alice.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
            'interop:delegationAllowed': true,
            'interop:delegationLimit': 1
          })
        ])
      );
    });

    // The grant is stored in Bob storage
    await waitForExpect(async () => {
      await expect(
        bob.call('access-grants.getByResourceUri', {
          resourceUri: eventUri
        })
      ).resolves.toMatchObject({
        type: 'interop:AccessGrant',
        'interop:dataOwner': alice.id,
        'interop:grantee': bob.id,
        'interop:granteeType': 'interop:SocialAgent',
        'interop:grantedBy': alice.id,
        'interop:hasDataInstance': eventUri,
        'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
        'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
        'interop:delegationAllowed': true,
        'interop:delegationLimit': 1
      });
    });
  });

  test('Bob shares Alice event with Craig', async () => {
    await bob.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: craig.id,
      accessModes: ['acl:Read']
    });

    // An authorization is created with the delegation information
    await waitForExpect(async () => {
      const authorizations = await bob.call('access-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(authorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': craig.id,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // A delegated grant is created by Alice and shared with Craig
    await waitForExpect(async () => {
      const craigRegistration = await bob.call('social-agent-registrations.getForAgent', {
        agentUri: craig.id,
        podOwner: bob.id
      });

      await expect(
        bob.call('social-agent-registrations.getGrants', {
          agentRegistration: craigRegistration,
          podOwner: bob.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantedBy': bob.id,
            'interop:grantee': craig.id,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // A delegated grant is created by Craig for the application
    await waitForExpect(async () => {
      const craigAppRegistration = await craig.call('app-registrations.get', {
        resourceUri: craigAppRegistrationUri
      });

      const grants = await craig.call('app-registrations.getGrants', {
        agentRegistration: craigAppRegistration,
        podOwner: craig.id
      });

      expect(grants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:granteeType': 'interop:Application',
            'interop:grantedBy': craig.id,
            'interop:hasDataInstance': eventUri,
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // Craig can fetch Alice event
    await expect(
      craig.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  test('Only the grantee of a grant can delegate it, if allowed', async () => {
    const issueAsCraig = (grant: any, grantee: any, delegation = {}) => {
      const { id, 'dc:created': c, 'dc:modified': m, 'dc:creator': cr, ...properties } = grant;
      return podProvider.call(
        'delegation-endpoint.issue',
        {
          delegatedGrant: {
            ...properties,
            type: 'interop:DelegatedAccessGrant',
            'interop:grantee': grantee.id,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:grantedBy': craig.id,
            'interop:delegationOfGrant': id,
            ...delegation
          }
        },
        { meta: { webId: craig.id, dataset: 'alice' } }
      );
    };

    // Craig delegates the grant received by Bob
    const bobGrant = await bob.call('access-grants.getByResourceUri', { resourceUri: eventUri });
    await expect(issueAsCraig(bobGrant, alice)).rejects.toMatchObject({ code: 403 });

    // Craig delegates his own grant, which doesn't allow delegation
    const craigRegistration = await bob.call('social-agent-registrations.getForAgent', {
      agentUri: craig.id,
      podOwner: bob.id
    });
    const [craigGrant] = await bob.call('social-agent-registrations.getGrants', {
      agentRegistration: craigRegistration,
      podOwner: bob.id
    });
    expect(craigGrant['interop:delegationAllowed']).toBeUndefined();
    await expect(issueAsCraig(craigGrant, alice)).rejects.toMatchObject({ code: 403 });

    // Craig's app cannot get more delegation rights than Craig
    await expect(
      issueAsCraig(
        craigGrant,
        { id: APP_URI },
        { 'interop:granteeType': 'interop:Application', 'interop:delegationAllowed': true }
      )
    ).rejects.toMatchObject({ code: 403 });
  });

  test('Craig remove the app and the delegated grant is deleted', async () => {
    await craig.call('registration-endpoint.remove', {
      appUri: APP_URI
    });

    // We should only have the delegated grant of Bob to Craig
    await waitForExpect(async () => {
      const delegatedGrants = await craig.call('delegated-access-grants.list');
      expect(arrayOf(delegatedGrants['ldp:contains'])).toHaveLength(1);
    });
  });

  test('Bob shares a second Alice event with Craig, after his grant was replaced', async () => {
    secondEventUri = await alice.call('ldp.container.post', {
      containerUri: eventContainerUri,
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Garden party'
      },
      contentType: MIME_TYPES.JSON
    });

    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: secondEventUri,
      grantee: bob.id,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    await waitForExpect(async () => {
      const grant = await bob.call('access-grants.getByResourceUri', { resourceUri: secondEventUri });
      expect(grant).toMatchObject({ 'interop:replaces': expect.any(String) });
    });

    await bob.call('access-authorizations.addForSingleResource', {
      resourceUri: secondEventUri,
      grantee: craig.id,
      accessModes: ['acl:Read']
    });

    await waitForExpect(async () => {
      const craigRegistration = await bob.call('social-agent-registrations.getForAgent', {
        agentUri: craig.id,
        podOwner: bob.id
      });

      const grants = await bob.call('social-agent-registrations.getGrants', {
        agentRegistration: craigRegistration,
        podOwner: bob.id
      });

      const delegatedGrant = grants.find((grant: any) =>
        arrayOf(grant['interop:hasDataInstance']).includes(secondEventUri)
      );
      expect(delegatedGrant).toMatchObject({ type: 'interop:DelegatedAccessGrant', 'interop:grantee': craig.id });
      expect(delegatedGrant['interop:replaces']).toBeUndefined();
    });

    // The permissions of the delegated grant were added
    await waitForExpect(async () => {
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: secondEventUri,
          accept: MIME_TYPES.JSON
        })
      ).resolves.toMatchObject({ name: 'Garden party' });
    });
  });

  test('Broken delegated shares are repaired without sending activities to the grantee', async () => {
    const insert = (resource: string, dataset: string) =>
      podProvider.call('triplestore.insert', {
        resource: resource.replace(/interop:(\w+)/g, '<http://www.w3.org/ns/solid/interop#$1>'),
        contentType: MIME_TYPES.TURTLE,
        webId: 'system',
        dataset
      });

    // Leftovers of failed attempts: an authorization in Bob storage and an incomplete delegated grant in Alice storage
    const authorizationsContainerUri = await bob.call('access-authorizations.getContainerUri', { webId: bob.id });
    const brokenAuthorizationUri = urlJoin(authorizationsContainerUri, 'broken');
    await insert(
      `
        <${authorizationsContainerUri}> <http://www.w3.org/ns/ldp#contains> <${brokenAuthorizationUri}> .
        <${brokenAuthorizationUri}> a interop:AccessAuthorization ;
          interop:grantedBy <${bob.id}> ;
          interop:dataOwner <${alice.id}> ;
          interop:grantee <${craig.id}> ;
          interop:granteeType interop:SocialAgent ;
          interop:hasDataRegistration <${eventContainerUri}> ;
          interop:hasDataInstance <${secondEventUri}> ;
          interop:accessMode <http://www.w3.org/ns/auth/acl#Read> ;
          interop:scopeOfAuthorization interop:SelectedFromRegistry .
      `,
      'bob'
    );

    const delegatedGrantsContainerUri = await alice.call('delegated-access-grants.getContainerUri', {
      webId: alice.id
    });
    const orphanGrantUri = urlJoin(delegatedGrantsContainerUri, 'orphan');
    await insert(
      `
        <${delegatedGrantsContainerUri}> <http://www.w3.org/ns/ldp#contains> <${orphanGrantUri}> .
        <${orphanGrantUri}> a interop:DelegatedAccessGrant ;
          interop:grantedBy <${bob.id}> ;
          interop:dataOwner <${alice.id}> ;
          interop:grantee <${craig.id}> ;
          interop:hasDataRegistration <${eventContainerUri}> ;
          interop:hasDataInstance <${secondEventUri}> ;
          interop:replaces <${urlJoin(alice.id, 'data/deleted-grant')}> .
      `,
      'alice'
    );

    const inboxBefore = await craig.call('activitypub.collection.get', { resourceUri: craig.inbox, webId: craig.id });

    await podProvider.call('repair.reshareDelegatedResources', { username: 'bob', dataOwner: alice.id });

    const authorizations = arrayOf(
      (
        await bob.call('access-authorizations.list', {
          filters: { 'http://www.w3.org/ns/solid/interop#grantee': craig.id }
        })
      )['ldp:contains']
    );
    expect(authorizations).toHaveLength(1);
    expect(arrayOf(authorizations[0]['interop:hasDataInstance'])).toEqual(
      expect.arrayContaining([eventUri, secondEventUri])
    );

    const issuedGrants = await podProvider.call('triplestore.query', {
      query: `
        PREFIX interop: <http://www.w3.org/ns/solid/interop#>
        SELECT ?grantUri WHERE { ?grantUri a interop:DelegatedAccessGrant ; interop:grantee <${craig.id}> }
      `,
      accept: MIME_TYPES.JSON,
      webId: 'system',
      dataset: 'alice'
    });
    expect(issuedGrants).toHaveLength(1);
    expect(issuedGrants[0].grantUri.value).not.toBe(orphanGrantUri);

    for (const resourceUri of [eventUri, secondEventUri]) {
      await expect(craig.call('ldp.resource.get', { resourceUri, accept: MIME_TYPES.JSON })).resolves.toMatchObject({
        type: OBJECT_TYPES.EVENT
      });
    }

    // Craig is in the announces collection of the event
    await waitForExpect(async () => {
      const event = await alice.call('ldp.resource.get', { resourceUri: secondEventUri, accept: MIME_TYPES.JSON });
      await expect(
        alice.call('activitypub.collection.includes', { collectionUri: event['apods:announces'], itemUri: craig.id })
      ).resolves.toBeTruthy();
    });

    // The event is stored in Craig storage
    const [eventsContainerUri] = await craig.call('type-registrations.findContainersUris', {
      type: 'https://www.w3.org/ns/activitystreams#Event',
      webId: craig.id
    });
    await expect(craig.call('ldp.container.getUris', { containerUri: eventsContainerUri })).resolves.toEqual(
      expect.arrayContaining([secondEventUri])
    );

    const inboxAfter = await craig.call('activitypub.collection.get', { resourceUri: craig.inbox, webId: craig.id });
    expect(inboxAfter.totalItems).toBe(inboxBefore.totalItems);
  });

  test('Bob stops sharing one of Alice events with Craig, who keeps access to the other one', async () => {
    await bob.call('access-authorizations.removeForSingleResource', { resourceUri: eventUri, grantee: craig.id });

    await waitForExpect(async () => {
      const container = await alice.call('delegated-access-grants.list', {
        filters: { 'http://www.w3.org/ns/solid/interop#grantee': craig.id }
      });
      const delegatedGrants = arrayOf(container['ldp:contains']);
      expect(delegatedGrants).toHaveLength(1);
      expect(arrayOf(delegatedGrants[0]['interop:hasDataInstance'])).toEqual([secondEventUri]);
    });

    for (const [resourceUri, read] of [
      [eventUri, false],
      [secondEventUri, true]
    ]) {
      await expect(
        podProvider.call('webacl.resource.hasRights', { resourceUri, rights: { read: true }, webId: craig.id })
      ).resolves.toMatchObject({ read });
    }
  });

  test('Bob stops sharing the other event with Craig, whose delegated grants are deleted', async () => {
    const getCraigDelegatedGrants = async () =>
      arrayOf((await craig.call('delegated-access-grants.list'))['ldp:contains']);

    await installApp(craig, APP_URI);

    await waitForExpect(async () => {
      const appGrants = (await getCraigDelegatedGrants()).filter((grant: any) => grant['interop:grantee'] === APP_URI);
      expect(appGrants).not.toHaveLength(0);
    });

    await bob.call('access-authorizations.removeForSingleResource', { resourceUri: secondEventUri, grantee: craig.id });

    // Craig received a Delete activity: his copies and the grants delegated to his app are deleted
    await waitForExpect(async () => {
      await expect(getCraigDelegatedGrants()).resolves.toHaveLength(0);
    });

    for (const webId of [craig.id, APP_URI]) {
      await expect(
        podProvider.call('webacl.resource.hasRights', { resourceUri: secondEventUri, rights: { read: true }, webId })
      ).resolves.toMatchObject({ read: false });
    }
  });
});
