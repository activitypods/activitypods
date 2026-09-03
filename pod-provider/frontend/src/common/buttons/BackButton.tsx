import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslate, Button } from 'react-admin';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const BackButton = ({ to, color }: any) => {
  const translate = useTranslate();
  return (
    <Link to={to}>
      <Button label={translate('ra.action.back')} color={color}>
        <ArrowBackIcon />
      </Button>
    </Link>
  );
};

export default BackButton;
