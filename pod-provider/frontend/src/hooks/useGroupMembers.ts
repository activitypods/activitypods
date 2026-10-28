import { useCallback, useEffect, useState } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';
import useGroupRights from './useGroupRights';

export type GroupMember = { webId: string; roles: string[]; invited?: boolean; requested?: boolean; content?: string };

export type GroupRole = {
  id: string;
  label: string;
  isDefaultRole: boolean;
  isSystemRole: boolean;
  extendsRoles: string[];
  specialRights: string[];
};

export type GroupRoleData = Pick<GroupRole, 'label' | 'extendsRoles' | 'specialRights'>;

const useGroupMembers = () => {
  const dataProvider = useDataProvider();
  const { endpoint, isOwner, rights, isLoading: isRightsLoading } = useGroupRights();
  const [members, setMembers] = useState<GroupMember[]>();
  const [roles, setRoles] = useState<GroupRole[]>();
  const [isLoading, setIsLoading] = useState(true);

  const canReadMembers = rights.includes('interop:ReadMembers');

  const refetch = useCallback(async () => {
    if (!canReadMembers) {
      setIsLoading(false);
      return;
    }
    const [{ json: membersJson }, { json: rolesJson }] = await Promise.all([
      dataProvider.fetch(urlJoin(endpoint!, 'members')),
      dataProvider.fetch(urlJoin(endpoint!, 'roles'))
    ]);
    setMembers(membersJson);
    setRoles(rolesJson);
    setIsLoading(false);
  }, [dataProvider, endpoint, canReadMembers]);

  useEffect(() => {
    if (endpoint && !isRightsLoading) refetch();
  }, [endpoint, isRightsLoading, refetch]);

  const send = useCallback(
    async (path: string, method: string, body?: object) => {
      await dataProvider.fetch(urlJoin(endpoint!, path), {
        method,
        body: body && JSON.stringify(body),
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
      await refetch();
    },
    [dataProvider, endpoint, refetch]
  );

  return {
    members,
    roles,
    isLoading: isRightsLoading || isLoading,
    refetch,
    isOwner,
    rights,
    addMember: (memberUri: string) => send('members', 'POST', { memberUri }),
    removeMember: (memberUri: string) => send('members', 'DELETE', { memberUri }),
    addRoleMember: (role: string, memberUri: string) => send(`roles/${role}/members`, 'POST', { memberUri }),
    removeRoleMember: (role: string, memberUri: string) => send(`roles/${role}/members`, 'DELETE', { memberUri }),
    createRole: (data: GroupRoleData) => send('roles', 'POST', data),
    updateRole: (role: string, data: GroupRoleData) => send(`roles/${role}`, 'PUT', data),
    deleteRole: (role: string) => send(`roles/${role}`, 'DELETE')
  };
};

export default useGroupMembers;

// Roles that the member only has because another of their roles extends them
export const getInheritedRoles = (memberRoles: string[], roles: GroupRole[] = []) =>
  roles.filter(role => memberRoles.includes(role.id)).flatMap(role => role.extendsRoles);
