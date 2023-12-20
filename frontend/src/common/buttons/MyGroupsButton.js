import React from 'react';
import { Link, Button, useTranslate, useCreatePath } from 'react-admin';
import GroupIcon from '@mui/icons-material/Group';

const MyGroupsButton = ({ color }) => {
  const createPath = useCreatePath();
  const translate = useTranslate();

  return (
    <Link to={createPath({ resource: 'Group', type: 'list' })}>
      <Button label={translate('app.page.groups')} color={color}>
        <GroupIcon />
      </Button>
    </Link>
  );
};

export default MyGroupsButton;
