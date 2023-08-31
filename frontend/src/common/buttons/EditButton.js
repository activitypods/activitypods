import React from 'react';
import { useShowContext, Link, Button, usePermissions, useTranslate, useCreatePath } from 'react-admin';
import EditIcon from '@mui/icons-material/Edit';

const EditButton = () => {
  const createPath = useCreatePath();
  const { record, resource } = useShowContext();
  const { permissions } = usePermissions(record?.id);
  const translate = useTranslate();

  return !!permissions && permissions.some((p) => ['acl:Append', 'acl:Write'].includes(p['acl:mode'])) ? (
    <Link to={createPath({ resource, id: record?.id, type: 'show' })}>
      <Button label={translate('ra.action.edit')}>
        <EditIcon />
      </Button>
    </Link>
  ) : null;
};

export default EditButton;
