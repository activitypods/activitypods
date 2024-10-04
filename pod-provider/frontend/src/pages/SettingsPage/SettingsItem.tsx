import React, { ReactNode, FunctionComponent } from 'react';
import { useTranslate } from 'react-admin';
import {
  ListItem,
  ListItemButton,
  Avatar,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Switch
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import EditIcon from '@mui/icons-material/Edit';

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

const SettingsItem: FunctionComponent<Props> = ({ onClick, icon, actionIcon, label, value }) => {
  const translate = useTranslate();
  const classes = useStyles();
  return (
    <ListItem className={classes.listItem}>
      {value === true || value === false ? (
        <ListItemButton onClick={onClick}>
          <ListItemAvatar>
            <Avatar>{icon}</Avatar>
          </ListItemAvatar>
          <ListItemText primary={translate(label)} className={classes.listItemText} />
          <Switch edge="end" onChange={onClick} checked={value} />
        </ListItemButton>
      ) : (
        <ListItemButton onClick={onClick}>
          <ListItemAvatar>
            <Avatar>{icon}</Avatar>
          </ListItemAvatar>
          <ListItemText primary={translate(label)} secondary={value} className={classes.listItemText} />
          <ListItemSecondaryAction>
            <IconButton>{actionIcon || <EditIcon />}</IconButton>
          </ListItemSecondaryAction>
        </ListItemButton>
      )}
    </ListItem>
  );
};

type Props = {
  onClick: () => void;
  icon: ReactNode;
  actionIcon?: ReactNode;
  label: string;
  value?: string | boolean;
};

export default SettingsItem;
