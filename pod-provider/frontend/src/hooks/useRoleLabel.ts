import { useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { GroupRole } from './useGroupMembers';

const DEFAULT_LABELS: Record<string, string> = { member: 'Member', admin: 'Admin', owner: 'Owner' };

const useRoleLabel = () => {
  const translate = useTranslate();
  return useCallback(
    (role: GroupRole) => (DEFAULT_LABELS[role.id] === role.label ? translate(`app.role.${role.id}`) : role.label),
    [translate]
  );
};

export default useRoleLabel;
