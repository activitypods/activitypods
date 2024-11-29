import { useState, useRef } from 'react';
import { Button, Paper, Popper, MenuItem, MenuList, ClickAwayListener } from '@mui/material';
import { useCreatePath, useGetIdentity, useTranslate } from 'react-admin';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { Link } from 'react-router-dom';

const EditProfileButton = props => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const createPath = useCreatePath();
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();

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
              <Link
                to={createPath({ resource: 'Profile', id: identity?.webIdData?.url, type: 'edit' })}
                style={{ textDecoration: 'none' }}
              >
                <MenuItem>{translate('app.action.edit_private_profile')}</MenuItem>
              </Link>
              <Link
                to={createPath({ resource: 'Actor', id: identity?.id, type: 'edit' })}
                style={{ textDecoration: 'none' }}
              >
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
