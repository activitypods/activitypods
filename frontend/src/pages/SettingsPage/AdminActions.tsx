import React from 'react';
import { useTranslate } from 'react-admin';
import {
  ListItem,
  ListItemButton,
  Avatar,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  useTheme
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useNavigate } from 'react-router-dom';
import StorageIcon from '@mui/icons-material/Storage';
import DownloadIcon from '@mui/icons-material/Download';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import DeleteIcon from '@mui/icons-material/Delete';

const useStyles = makeStyles(() => ({
  listItem: {
    backgroundColor: 'white',
    padding: 0,
    marginBottom: 8,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)'
  },
  listItemText: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    marginRight: 32
  }
}));

const AdminActions = () => {
  const translate = useTranslate();
  const theme = useTheme();
  const navigate = useNavigate();

  const classes = useStyles();

  const onExportClicked = () => {
    navigate('/settings/export-pod');
  };
  const onDeleteClicked = () => {
    navigate('/settings/delete-pod');
  };

  return (
    <>
      <ListItem className={classes.listItem}>
        <ListItemButton onClick={() => onExportClicked()}>
          <ListItemAvatar>
            <Avatar>
              <StorageIcon />
            </Avatar>
          </ListItemAvatar>
          <ListItemText primary={translate('app.setting.export')} className={classes.listItemText} />
          <ListItemSecondaryAction>
            <IconButton>
              <DownloadIcon />
            </IconButton>
          </ListItemSecondaryAction>
        </ListItemButton>
      </ListItem>
      <ListItem className={classes.listItem}>
        <ListItemButton onClick={() => onDeleteClicked()}>
          <ListItemAvatar>
            <Avatar>
              <DeleteIcon color="error" />
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={translate('app.setting.delete')}
            className={classes.listItemText}
            sx={{ color: theme.palette.error.main }}
          />
          <ListItemSecondaryAction>
            <IconButton>
              <HighlightOffIcon color="error" />
            </IconButton>
          </ListItemSecondaryAction>
        </ListItemButton>
      </ListItem>
    </>
  );
};

export default AdminActions;
