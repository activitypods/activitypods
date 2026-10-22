import React, { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import useRoleLabel from '../../hooks/useRoleLabel';
import { GroupRole, GroupRoleData } from '../../hooks/useGroupMembers';

export const SPECIAL_RIGHTS = ['interop:ReadMembers', 'interop:ManageMembers', 'interop:ManageRoles'];

type Props = {
  open: boolean;
  role?: GroupRole;
  roles: GroupRole[];
  rights: string[];
  onClose: () => void;
  onSave: (data: GroupRoleData) => Promise<void>;
};

const RoleDialog = ({ open, role, roles, rights, onClose, onSave }: Props) => {
  const translate = useTranslate();
  const roleLabel = useRoleLabel();
  const [label, setLabel] = useState('');
  const [extendsRoles, setExtendsRoles] = useState<string[]>([]);
  const [specialRights, setSpecialRights] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(role ? roleLabel(role) : '');
      setExtendsRoles(role?.extendsRoles || []);
      setSpecialRights(role?.specialRights || []);
    }
  }, [open, role, roleLabel]);

  const extendableRoles = roles.filter(r => r.id !== 'owner' && !r.isDefaultRole && r.id !== role?.id);

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave({ label: label.trim(), extendsRoles, specialRights });
      onClose();
    } catch {
      // The error has already been notified
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate(role ? 'app.action.edit_role' : 'app.action.create_role')}</DialogTitle>
      <DialogContent>
        <TextField
          label={translate('app.input.role_label')}
          value={label}
          onChange={e => setLabel(e.target.value)}
          fullWidth
          margin="dense"
          autoFocus
        />
        {extendableRoles.length > 0 && (
          <FormControl fullWidth margin="dense">
            <InputLabel id="extends-roles-label">{translate('app.input.extends_roles')}</InputLabel>
            <Select
              labelId="extends-roles-label"
              multiple
              value={extendsRoles}
              onChange={e => setExtendsRoles(e.target.value as string[])}
              input={<OutlinedInput label={translate('app.input.extends_roles')} />}
              renderValue={selected =>
                extendableRoles
                  .filter(r => selected.includes(r.id))
                  .map(r => roleLabel(r))
                  .join(', ')
              }
            >
              {extendableRoles.map(r => (
                <MenuItem key={r.id} value={r.id}>
                  <Checkbox checked={extendsRoles.includes(r.id)} size="small" />
                  {roleLabel(r)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl component="fieldset" margin="dense">
          <FormLabel component="legend">{translate('app.input.special_rights')}</FormLabel>
          <FormGroup>
            {SPECIAL_RIGHTS.map(right => (
              <FormControlLabel
                key={right}
                control={
                  <Checkbox
                    checked={specialRights.includes(right)}
                    disabled={!rights.includes(right)}
                    onChange={e =>
                      setSpecialRights(
                        e.target.checked ? [...specialRights, right] : specialRights.filter(r => r !== right)
                      )
                    }
                  />
                }
                label={translate(`app.special_right.${right.split(':')[1]}`)}
              />
            ))}
          </FormGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate('ra.action.cancel')}</Button>
        <Button variant="contained" color="secondary" onClick={save} disabled={isSaving || !label.trim()}>
          {translate('ra.action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RoleDialog;
