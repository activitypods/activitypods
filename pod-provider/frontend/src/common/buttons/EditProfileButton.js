import { useState, useRef } from 'react';
import { Button, Paper, Popper, MenuItem, MenuList, ClickAwayListener } from '@mui/material';
import { useTranslate } from 'react-admin';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { Link } from 'react-router-dom';

const EditProfileButton = props => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const translate = useTranslate();
  return (
    <>
      <Button
        variant="contained"
        endIcon={<ArrowDropDownIcon />}
        onClick={() => setOpen(prevOpen => !prevOpen)}
        ref={anchorRef}
        {...props}
      >
        {translate('app.action.edit_profile')}
      </Button>
      <Popper sx={{ zIndex: 1 }} open={open} anchorEl={anchorRef.current} placement="bottom">
        <Paper>
          <ClickAwayListener onClickAway={() => setOpen(false)}>
            <MenuList>
              <Link to="/settings/profiles/private" style={{ textDecoration: 'none' }}>
                <MenuItem>{translate('app.action.edit_private_profile')}</MenuItem>
              </Link>
              <Link to="/settings/profiles/public" style={{ textDecoration: 'none' }}>
                <MenuItem>{translate('app.action.edit_public_profile')}</MenuItem>
              </Link>
            </MenuList>
          </ClickAwayListener>
        </Paper>
      </Popper>
    </>
  );
};

export default EditProfileButton;
