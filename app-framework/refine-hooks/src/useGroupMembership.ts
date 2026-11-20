import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  forgetGroupMembership,
  getAppGrants,
  getGroupMembership,
  onAppGrantsChange,
  type GroupMembership,
  type Identity
} from '@activitypods/refine-providers';
import useAuthProvider from './useAuthProvider';
import useOutbox from './useOutbox';

export type GroupMembershipStatus =
  | 'member'
  /** A request to join is waiting for the admins */
  | 'requested'
  | 'invited'
  /** Open group */
  | 'can-join'
  /** Moderated group */
  | 'can-request'
  /** The group can only be joined by invitation */
  | 'closed';

const getStatus = (membership: GroupMembership): GroupMembershipStatus => {
  if (membership.roles.length > 0) return 'member';
  if (membership.joinRequest) return 'requested';
  if (membership.invitation) return 'invited';
  if (membership.joinPolicy === 'interop:OpenJoin') return 'can-join';
  if (membership.joinPolicy === 'interop:ModeratedJoin') return 'can-request';
  return 'closed';
};

const getSessionItem = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const setSessionItem = (key: string, value?: string) => {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Not available, e.g. in a private window
  }
};

const POLL_INTERVAL = 1500;
const POLL_DURATION = 15000;

/**
 * The membership of the logged-in user in a group, and the actions to join it, cancel a request or leave it.
 * Once the user is a member, the app is sent to the authorization agent if it has no access yet to the data of the group.
 */
const useGroupMembership = (groupWebId?: string) => {
  const authProvider = useAuthProvider();
  const { data: identity } = useGetIdentity<Identity>();
  const queryClient = useQueryClient();
  const outbox = useOutbox();
  const session = identity?.id ? authProvider.getSession() : undefined;
  const [waitingSince, setWaitingSince] = useState<number>();

  const queryKey = ['group-membership', session?.webId, groupWebId];
  const { data: membership, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      forgetGroupMembership(groupWebId!, session!);
      return getGroupMembership(groupWebId!, session!);
    },
    enabled: !!session && !!groupWebId,
    staleTime: 60000,
    refetchInterval: waitingSince ? POLL_INTERVAL : false
  });
  const status = membership && getStatus(membership);

  useEffect(
    () =>
      onAppGrantsChange(webId => {
        if (webId === session?.webId) queryClient.invalidateQueries({ queryKey: ['group-membership', webId] });
      }),
    [queryClient, session?.webId]
  );

  // Stop polling once the group answered, or after a while (e.g. the admins must accept the request)
  const [statusBefore, setStatusBefore] = useState<GroupMembershipStatus>();
  useEffect(() => {
    if (!waitingSince) return;
    if (status !== statusBefore || Date.now() - waitingSince > POLL_DURATION) setWaitingSince(undefined);
  }, [status, statusBefore, waitingSince, membership]);

  // Kept in the session storage, as the app may first be sent to the authorization agent
  const joinedKey = `activitypods.joined|${groupWebId}`;
  const previousStatus = useRef<GroupMembershipStatus | undefined>(undefined);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (status !== 'member' || !session || !groupWebId) return;
    if (previous && previous !== 'member') setSessionItem(joinedKey, '1');
    (async () => {
      const grants = await getAppGrants(session);
      if (!grants.some(grant => grant['interop:dataOwner'] === groupWebId)) {
        // Redirects to the authorization agent if the app can be given access to the data of the group
        if (!(await authProvider.registerApp())) return;
      }
      if (getSessionItem(joinedKey)) setJoined(true);
    })().catch(e => console.warn(`Could not check the access to ${groupWebId}`, e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, groupWebId, session?.webId]);

  /** To call once the user has been told that they joined the group */
  const acknowledgeJoined = useCallback(() => {
    setSessionItem(joinedKey, undefined);
    setJoined(false);
  }, [joinedKey]);

  const post = useCallback(
    async (activity: Record<string, any>) => {
      await outbox.post({ actor: session?.webId, to: groupWebId, ...activity });
      setStatusBefore(status);
      setWaitingSince(Date.now());
    },
    [outbox, session?.webId, groupWebId, status]
  );

  /** Join the group, accept the invitation, or ask to join, depending on the join policy */
  const join = useCallback((content?: string) => post({ type: 'Join', object: groupWebId, content }), [post, groupWebId]);

  const cancelRequest = useCallback(
    () => post({ type: 'Undo', object: membership?.joinRequest }),
    [post, membership?.joinRequest]
  );

  /** The group refuses if the user is its only owner */
  const leave = useCallback(() => post({ type: 'Leave', object: groupWebId }), [post, groupWebId]);

  return {
    membership,
    status,
    isLoading,
    isWaiting: !!waitingSince,
    /** The user just became a member, and the app has access to the data of the group */
    joined,
    acknowledgeJoined,
    join,
    cancelRequest,
    leave
  };
};

export default useGroupMembership;
