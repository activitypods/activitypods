import React, { useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { Avatar, Switch, ListItemAvatar, ListItemText, ListItem } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import GroupIcon from '@mui/icons-material/Group';
import { arrayOf } from '../../utils';

/** @typedef {import("./ShareDialog").InvitationState} InvitationState */

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
    // @ts-ignore
    backgroundImage: `radial-gradient(circle at 50% 3em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
  }
}));

const GroupContactsItem = ({
  group,
  invitations,
  onChange,
  isCreator
}: {
  group: any;
  invitations: Record<string, any>;
  onChange: (invitations: Record<string, any>) => void;
  isCreator: boolean;
}) => {
  const classes = useStyles();
  const translate = useTranslate();

  const groupMemberIds = arrayOf(group?.['vcard:hasMember']);

  const viewChecked = groupMemberIds.every(
    memberId => invitations[memberId]?.canView || invitations[memberId]?.canShare
  );
  const shareChecked = groupMemberIds.every(memberId => invitations[memberId]?.canShare);
  const viewSwitchReadonly = groupMemberIds.every(
    memberId => invitations[memberId]?.viewReadonly || invitations[memberId]?.shareReadonly
  );
  const shareSwitchReadonly = groupMemberIds.every(memberId => invitations[memberId]?.shareReadonly);

  const switchShare = useCallback(() => {
    // Create invitation object for every group member.
    const newInvitations = Object.fromEntries(
      groupMemberIds
        .map(memberId => {
          if (invitations[memberId]?.shareReadonly) {
            return [undefined, undefined];
          } else {
            const newShareState = !shareChecked;
            return [
              memberId,
              {
                ...invitations[memberId],
                canShare: newShareState,
                canView: newShareState || viewChecked
              }
            ];
          }
        })
        .filter(([key, val]) => key && val)
    );
    onChange(newInvitations);
  }, [shareChecked, viewChecked, invitations, onChange, groupMemberIds]);

  const switchView = useCallback(() => {
    // Create invitation object for every group member.
    const newInvitations = Object.fromEntries(
      groupMemberIds
        .map(memberId => {
          if (invitations[memberId]?.viewReadonly) {
            return [undefined, undefined];
          } else {
            const newViewState = !viewChecked;
            return [
              memberId,
              {
                ...invitations[memberId],
                canView: newViewState,
                canShare: newViewState && shareChecked
              }
            ];
          }
        })
        .filter(([key, val]) => key && val)
    );
    onChange(newInvitations);
  }, [viewChecked, shareChecked, invitations, onChange, groupMemberIds]);

  return (
    <ListItem className={classes.listItem}>
      <ListItemAvatar className={classes.avatarItem}>
        <Avatar src={group?.['vcard:photo']} className={classes.avatar}>
          <GroupIcon />
        </Avatar>
      </ListItemAvatar>
      <ListItemText className={classes.primaryText} primary={group?.['vcard:label']} />
      <ListItemText
        className={classes.secondaryText}
        primary={translate('apods.permission.view')}
        secondary={
          <Switch size="small" checked={viewChecked} disabled={viewSwitchReadonly || !group} onClick={switchView} />
        }
      />
      {isCreator && (
        <ListItemText
          className={classes.secondaryText}
          primary={translate('apods.permission.share')}
          secondary={
            <Switch
              size="small"
              checked={shareChecked}
              disabled={shareSwitchReadonly || !group}
              onClick={switchShare}
            />
          }
        />
      )}
    </ListItem>
  );
};

export default GroupContactsItem;
