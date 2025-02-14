import React from 'react';
import { styled } from '@mui/material/styles';
import { Link } from '@mui/material';
import { useTranslate } from 'react-admin';

const StyledLink = styled(Link)(({ theme }) => ({
  position: 'absolute',
  left: '-999px',
  width: '1px',
  height: '1px',
  top: 'auto',
  overflow: 'hidden',
  zIndex: theme.zIndex.modal + 1,
  '&:focus': {
    left: '0',
    top: '0',
    width: 'auto',
    height: 'auto',
    padding: theme.spacing(2),  
    color: theme.palette.primary.main,
    backgroundColor: theme.palette.background.paper,
    textDecoration: 'none',
    outline: `2px solid ${theme.palette.primary.main}`,
  },
}));

const SkipLink = () => {
  const translate = useTranslate();
  
  const handleClick = (event) => {
    event.preventDefault();
    const main = document.querySelector('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus();
      // Remove tabindex after focus to prevent unwanted focus ring
      main.removeAttribute('tabindex');
    }
  };

  return (
    <StyledLink
      href="#main"
      onClick={handleClick}
      aria-label={translate('app.action.skip_to_main')}
    >
      {translate('app.action.skip_to_main')}
    </StyledLink>
  );
};

export default SkipLink; 