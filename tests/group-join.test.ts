import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import fetch from 'node-fetch';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { arrayOf, fetchMails } from './utils.ts';
jest.setTimeout(100000);

describe('Test joining groups', () => {
  let podProvider: any, alice: any, bob: any, craig: any, groupWebId: string, groupUrl: string;

  const call = (actor: any, actionName: string, params: any) =>
    podProvider.call(actionName, params, { meta: { webId: actor.id } });

  const fetchAs = (actor: any, path: string, method = 'GET', body?: any) =>
    fetch(urlJoin(groupUrl, path), {
      method,
      headers: {
        Authorization: `Bearer ${actor.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

  const getInbox = async (actor: any) => {
    const inboxMenu = await call(actor, 'activitypub.collection.get', { resourceUri: actor.inbox });
    const inbox = await call(actor, 'activitypub.collection.get', {
      resourceUri: actor.inbox,
      afterEq: new URL(inboxMenu.first).searchParams.get('afterEq')
    });
    return arrayOf(inbox.orderedItems);
  };

  const getGroups = async (actor: any) => {
    const webIdData = await podProvider.call('webid.get', { resourceUri: actor.id });
    if (!webIdData['apods:groups']) return [];
    const collection = await call(actor, 'activitypub.collection.get', { resourceUri: webIdData['apods:groups'] });
    return arrayOf(collection.items);
  };

  const getMembers = async () => {
    const memberUri = await podProvider.call('role-registrations.getUri', { groupWebId, role: 'member' });
    const member = await podProvider.call('role-registrations.get', { resourceUri: memberUri, webId: 'system' });
    return arrayOf(member['interop:hasMember']);
  };

  const join = (actor: any, content?: string) =>
    call(actor, 'activitypub.outbox.post', {
      collectionUri: actor.outbox,
      type: 'Join',
      actor: actor.id,
      object: groupWebId,
      content,
      to: groupWebId
    });

  const waitForAnswer = (actor: any, type: 'Accept' | 'Reject', joinActivity: any) =>
    waitForExpect(async () => {
      await expect(getInbox(actor)).resolves.toContainEqual(
        expect.objectContaining({ type, actor: groupWebId, object: joinActivity.id })
      );
    });

  const setJoinPolicy = (actor: any, joinPolicy: string) => fetchAs(actor, 'join-policy', 'PUT', { joinPolicy });

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    const actors = [];
    for (let i = 1; i <= 3; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId, token } = await podProvider.call('auth.signup', actorData);
      const actor = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        { actorUri: webId },
        { meta: { dataset: actorData.username } }
      );
      actors.push({ ...actor, token });
    }
    [alice, bob, craig] = actors;

    await call(alice, 'groups.create', { id: 'acme', type: 'foaf:Organization' });
    groupWebId = urlJoin(new URL(alice.id).origin, 'acme');
    groupUrl = urlJoin(new URL(alice.id).origin, '.account/acme');
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('By default, groups can only be joined by invitation', async () => {
    const joinActivity = await join(bob);
    await waitForAnswer(bob, 'Reject', joinActivity);
    await expect(getMembers()).resolves.not.toContain(bob.id);

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({
          recipients: ['<bob@test.com>'],
          subject: 'Your request to join acme has been rejected'
        })
      );
    });
  });

  test('Only those with the ChangeJoinPolicy right can change the join policy', async () => {
    expect((await setJoinPolicy(bob, 'apods:OpenJoin')).status).toBe(403);
    expect((await setJoinPolicy(alice, 'apods:Whatever')).status).toBe(422);
    expect((await setJoinPolicy(alice, 'apods:ModeratedJoin')).status).toBe(200);

    const group = await podProvider.call('webid.get', { resourceUri: groupWebId });
    expect(group['apods:joinPolicy']).toBe('apods:ModeratedJoin');
  });

  test('Bob asks to join, the admins are notified, and Alice rejects the request', async () => {
    const joinActivity = await join(bob, 'I would like to join');

    await waitForExpect(async () => {
      await expect((await fetchAs(alice, 'members')).json()).resolves.toContainEqual({
        webId: bob.id,
        roles: [],
        requested: true,
        content: 'I would like to join'
      });
    });
    await expect((await fetchAs(bob, 'me')).json()).resolves.toMatchObject({ roles: [], joinRequest: joinActivity.id });

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({
          recipients: ['<alice@test.com>'],
          subject: expect.stringMatching(/^bob would like to join acme$/i)
        })
      );
    });

    // A second request is ignored while the first one is pending
    await join(bob);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const requests = (await (await fetchAs(alice, 'members')).json()).filter((member: any) => member.requested);
    expect(requests).toHaveLength(1);

    expect((await fetchAs(alice, 'members', 'DELETE', { memberUri: bob.id })).status).toBe(200);
    await waitForAnswer(bob, 'Reject', joinActivity);
    await expect(getMembers()).resolves.not.toContain(bob.id);
  });

  test('Bob asks again, then cancels his request', async () => {
    const joinActivity = await join(bob);
    await waitForExpect(async () => {
      await expect((await fetchAs(bob, 'me')).json()).resolves.toMatchObject({ joinRequest: joinActivity.id });
    });

    await call(bob, 'activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: 'Undo',
      actor: bob.id,
      object: joinActivity.id,
      to: groupWebId
    });

    await waitForExpect(async () => {
      await expect((await fetchAs(bob, 'me')).json()).resolves.toEqual({ roles: [], specialRights: [] });
    });
  });

  test('Bob asks again and Alice accepts the request', async () => {
    const joinActivity = await join(bob);
    await waitForExpect(async () => {
      await expect((await fetchAs(bob, 'me')).json()).resolves.toMatchObject({ joinRequest: joinActivity.id });
    });

    expect((await fetchAs(alice, 'members', 'POST', { memberUri: bob.id })).status).toBe(200);

    await waitForAnswer(bob, 'Accept', joinActivity);
    await waitForExpect(async () => {
      await expect(getGroups(bob)).resolves.toEqual([groupWebId]);
    });
    await expect(getMembers()).resolves.toContain(bob.id);
    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({ recipients: ['<bob@test.com>'], subject: 'You are now a member of acme' })
      );
    });
  });

  test('A person who was invited joins directly, even if the group is moderated', async () => {
    expect((await fetchAs(alice, 'members', 'POST', { memberUri: craig.id })).status).toBe(200);
    await waitForExpect(async () => {
      await expect((await fetchAs(alice, 'members')).json()).resolves.toContainEqual(
        expect.objectContaining({ webId: craig.id, invited: true })
      );
    });

    const joinActivity = await join(craig);
    await waitForAnswer(craig, 'Accept', joinActivity);
    await expect(getMembers()).resolves.toContain(craig.id);

    const members = await (await fetchAs(alice, 'members')).json();
    expect(members.filter((member: any) => member.webId === craig.id)).toHaveLength(1);
  });

  test('Anyone can join an open group', async () => {
    expect((await fetchAs(alice, 'members', 'DELETE', { memberUri: craig.id })).status).toBe(200);
    expect((await setJoinPolicy(alice, 'apods:OpenJoin')).status).toBe(200);

    const joinActivity = await join(craig);
    await waitForAnswer(craig, 'Accept', joinActivity);
    await expect(getMembers()).resolves.toContain(craig.id);
  });
});
