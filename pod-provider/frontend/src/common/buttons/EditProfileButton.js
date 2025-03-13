import { useState, useRef } from 'react';
import { Button, Paper, Popper, MenuItem, MenuList, ClickAwayListener, ListItemIcon, ListItemText } from '@mui/material';
import { useTranslate } from 'react-admin';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import EditIcon from '@mui/icons-material/Edit';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import { Link } from 'react-router-dom';

const EditProfileButton = props => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const translate = useTranslate();
  return (
    <>
      <Button
        variant="contained"
        startIcon={<EditIcon />}
        endIcon={<ArrowDropDownIcon />}
        onClick={() => setOpen(prevOpen => !prevOpen)}
        ref={anchorRef}
        aria-label={translate('app.action.edit_profile')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? 'profile-menu' : undefined}
        sx={{
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 'medium',
          px: 2,
          py: 1,
          ...props.sx
        }}
        {...props}
      >
        {translate('app.action.edit_profile')}
      </Button>
      <Popper 
        sx={{ zIndex: 1 }} 
        open={open} 
        anchorEl={anchorRef.current} 
        placement="bottom" 
        role="menu" 
        id="profile-menu"
      >
        <Paper elevation={3} sx={{ mt: 1, minWidth: 200 }}>
          <ClickAwayListener onClickAway={() => setOpen(false)}>
            <MenuList>
              <Link 
                to="/settings/profiles/private" 
                style={{ textDecoration: 'none', color: 'inherit' }}
                aria-label={translate('app.action.edit_private_profile')}
                onClick={() => setOpen(false)}
              >
                <MenuItem role="menuitem">
                  <ListItemIcon>
                    <LockIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={translate('app.action.edit_private_profile')} />
                </MenuItem>
              </Link>
              <Link 
                to="/settings/profiles/public" 
                style={{ textDecoration: 'none', color: 'inherit' }}
                aria-label={translate('app.action.edit_public_profile')}
                onClick={() => setOpen(false)}
              >
                <MenuItem role="menuitem">
                  <ListItemIcon>
                    <PublicIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={translate('app.action.edit_public_profile')} />
                </MenuItem>
              </Link>
            </MenuList>
          </ClickAwayListener>
        </Paper>
      </Popper>
    </>
  );
};

export default EditProfileButton;
