import React from 'react';
import { useShowContext, Link, linkToRecord, Button, usePermissionsOptimized, useTranslate } from 'react-admin';
import EditIcon from '@material-ui/icons/Edit';

const EditButton = () => {
  const { basePath, record } = useShowContext();
  const { permissions } = usePermissionsOptimized(record?.id);
  const translate = useTranslate();

  return !!permissions && permissions.some((p) => ['acl:Append', 'acl:Write'].includes(p['acl:mode'])) ? (
    <Link to={linkToRecord(basePath, record?.id)}>
      <Button label={translate('ra.action.edit')}>
        <EditIcon />
      </Button>
    </Link>
  ) : null;
};

export default EditButton;
