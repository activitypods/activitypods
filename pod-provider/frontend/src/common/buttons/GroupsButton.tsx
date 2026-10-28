import React from 'react';
import { Link, Button, useTranslate } from 'react-admin';
import GroupIcon from '@mui/icons-material/PeopleAltOutlined';

const GroupsButton = (props: any) => {
  const translate = useTranslate();
  return (
    <Link to="/network/groups">
      <Button label={translate('app.page.my_groups')} {...props}>
        <GroupIcon />
      </Button>
    </Link>
  );
};

export default GroupsButton;
