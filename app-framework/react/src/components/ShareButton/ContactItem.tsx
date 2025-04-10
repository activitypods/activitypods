import React from 'react';
import { useTranslate } from 'react-admin';
import { Avatar, Switch, ListItemAvatar, ListItemText, ListItem } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';

import { formatUsername } from '../../utils';
/**
 * @typedef {import("./GroupContactsItem").InvitationState} InvitationState
 */

const useStyles = makeStyles(theme => ({
  listItem: {
    paddingLeft: 0,
    paddingRight: 0
  },
  primaryText: {
    width: '30%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexBasis: '100%'
  },
  secondaryText: {
    textAlign: 'center',
    width: '60%',
    fontStyle: 'italic',
    color: 'grey'
  },
  avatarItem: {
    minWidth: 50
  },
  avatar: {
    backgroundImage: `radial-gradient(circle at 50% 3em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
  }
}));

/**
 * @param {Object} props
 * @param {import("react-admin").Record} props.record
 * @param {InvitationState} [props.invitation]
 * @param {(invitations: Record<string, InvitationState>) => void} props.onChange
 * @param {boolean} props.isCreator
 */
const ContactItem = ({ record, invitation, onChange, isCreator }) => {
  const classes = useStyles();
  const translate = useTranslate();

  // The invitation may still be undefined. In that case, create a default one.
  // TODO: Maybe, this should be handled in the ShareDialog instead?
  const invitationState = invitation || {
    canView: false,
    canShare: false,
    viewReadonly: false,
    shareReadonly: !isCreator
  };

  const changeCanView = () => {
    const newViewState = !invitationState.canView;
    onChange({
      [record.describes]: {
        ...invitationState,
        canView: newViewState,
        // Set to false, if the user can't view the record anymore.
        canShare: newViewState && invitationState.canShare
      }
    });
  };

  const changeCanShare = () => {
    const newShareState = !invitationState.canShare;
    onChange({
      [record.describes]: {
        ...invitationState,
        canShare: newShareState,
        // Set to true, if the user can share the record.
        canView: newShareState || invitationState.canView
      }
    });
  };

  return (
    <ListItem className={classes.listItem}>
      <ListItemAvatar className={classes.avatarItem}>
        <Avatar src={record?.['vcard:photo']} className={classes.avatar}>
          {record['vcard:given-name']?.[0]}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        className={classes.primaryText}
        primary={record['vcard:given-name']}
        secondary={formatUsername(record.describes)}
      />
      <ListItemText
        className={classes.secondaryText}
        primary={translate('apods.permission.view')}
        secondary={
          <Switch
            size="small"
            checked={invitationState.canView || invitationState.canShare}
            disabled={invitationState.viewReadonly}
            onClick={changeCanView}
          />
        }
      />
      {isCreator && (
        <ListItemText
          className={classes.secondaryText}
          primary={translate('apods.permission.share')}
          secondary={
            <Switch
              size="small"
              checked={invitationState.canShare}
              disabled={invitationState.shareReadonly}
              onClick={changeCanShare}
            />
          }
        />
      )}
    </ListItem>
  );
};

export default ContactItem;
