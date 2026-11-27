import React, { useState } from 'react';
import { useTranslate, useNotify, Confirm } from 'react-admin';
import { List, ListItem, ListItemText, IconButton, Tooltip, Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Header from '../../common/Header';
import ListView from '../../layout/ListView';
import useRealmContext from '../../hooks/useRealmContext';
import useGroupMembers, { GroupRole, GroupRoleData } from '../../hooks/useGroupMembers';
import useRoleLabel from '../../hooks/useRoleLabel';
import RoleDialog from './RoleDialog';

const GroupRolesPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const roleLabel = useRoleLabel();
  const { isLoading: isGroupLoading, data: group } = useRealmContext() as any;
  const { roles, rights, isLoading, createRole, updateRole, deleteRole } = useGroupMembers();
  const [editedRole, setEditedRole] = useState<GroupRole | null>();
  const [deletedRole, setDeletedRole] = useState<GroupRole | null>();

  if (isGroupLoading) return null;

  const canManageRoles = rights.includes('interop:ManageRoles');

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e: any) {
      notify(e.message, { type: 'error' });
      throw e;
    }
  };

  const describe = (role: GroupRole) =>
    role.specialRights.length > 0
      ? role.specialRights.map(right => translate(`app.special_right.${right.split(':')[1]}`)).join(' · ')
      : translate('app.helper.no_special_rights');

  return (
    <>
      <Header title="app.titles.group_roles" titleVariables={{ groupName: group.fullName }} />
      <ListView
        title={translate('app.page.roles')}
        actions={
          canManageRoles
            ? [
                <Button startIcon={<AddIcon />} onClick={() => setEditedRole(null)}>
                  {translate('app.action.create_role')}
                </Button>
              ]
            : []
        }
      >
        {!isLoading && (
          <List>
            {roles?.map(role => (
              <ListItem
                key={role.id}
                sx={{ backgroundColor: 'white', mb: 1, boxShadow: 1 }}
                secondaryAction={
                  canManageRoles &&
                  !role.isSystemRole && (
                    <Box>
                      <Tooltip title={translate('app.action.edit_role')}>
                        <IconButton aria-label={translate('app.action.edit_role')} onClick={() => setEditedRole(role)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={translate('app.action.delete_role')}>
                        <IconButton
                          aria-label={translate('app.action.delete_role')}
                          onClick={() => setDeletedRole(role)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )
                }
              >
                <ListItemText primary={roleLabel(role)} secondary={describe(role)} />
              </ListItem>
            ))}
          </List>
        )}
      </ListView>
      <RoleDialog
        open={editedRole !== undefined}
        role={editedRole || undefined}
        roles={roles || []}
        rights={rights}
        onClose={() => setEditedRole(undefined)}
        onSave={(data: GroupRoleData) => run(() => (editedRole ? updateRole(editedRole.id, data) : createRole(data)))}
      />
      <Confirm
        isOpen={!!deletedRole}
        title={translate('app.action.delete_role')}
        content={translate('app.helper.delete_role', { role: deletedRole ? roleLabel(deletedRole) : '' })}
        onConfirm={async () => {
          const role = deletedRole!;
          setDeletedRole(null);
          await run(() => deleteRole(role.id)).catch(() => {});
        }}
        onClose={() => setDeletedRole(null)}
      />
    </>
  );
};

export default GroupRolesPage;
