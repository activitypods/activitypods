import React from 'react';
import { Link, Button, useTranslate, useCreatePath } from 'react-admin';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';

const TagsButton = props => {
  const createPath = useCreatePath();
  const translate = useTranslate();
  return (
    <Link to={createPath({ resource: 'Tag', type: 'list' })}>
      <Button label={translate('app.page.groups')} {...props}>
        <SellOutlinedIcon />
      </Button>
    </Link>
  );
};

export default TagsButton;
