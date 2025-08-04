import React, { useCallback, useEffect, useState } from 'react';
import { useRecordContext, useNotify, useTranslate, useGetIdentity } from 'react-admin';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useCollection, useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';
import ContactsShareList from './ContactsShareList';

/**
 * @typedef InvitationState
 * @property {boolean} canView
 * @property {boolean} canShare
 * @property {boolean} viewReadonly
 * @property {boolean} shareReadonly
 */

const useStyles = makeStyles(theme => ({
  dialogPaper: {
    margin: 16
  },
  title: {
    padding: 24,
    paddingBottom: 8,
    [theme.breakpoints.down('sm')]: {
      padding: 16,
      paddingBottom: 4
    }
  },
  actions: {
    padding: 15,
    height: 38
  },
  list: {
    width: '100%',
    maxWidth: '100%',
    backgroundColor: theme.palette.background.paper,
    padding: 0
  },
  listForm: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingRight: 0,
    marginRight: 24,
    height: 400,
    [theme.breakpoints.down('sm')]: {
      padding: '0px 16px',
      margin: 0,
      height: 'unset' // Full screen height for mobile
    }
  }
}));

const ShareDialog = ({ close, resourceUri, profileResource = 'Profile', groupResource = 'Group' }) => {
  const classes = useStyles();
  const { data: identity } = useGetIdentity();
  const record = useRecordContext();
  const translate = useTranslate();
  const creatorUri = record?.['dc:creator'];
  const isCreator = creatorUri && creatorUri === identity?.id;
  const { items: announces } = useCollection(record?.['apods:announces']);
  const { items: announcers } = useCollection(isCreator ? record?.['apods:announcers'] : undefined);
  /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */
  const [invitations, setInvitations] = useState({});
  // To keep track of changes...
  /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */
  const [newInvitations, setNewInvitations] = useState({});
  /** @type {[Record<string, InvitationState>, (invitations: Record<string, InvitationState>) => void]} */
  const [savedInvitations, setSavedInvitations] = useState({});
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const xs = useMediaQuery(theme => theme.breakpoints.down('xs'), {
    noSsr: true
  });
  const outbox = useOutbox();
  const notify = useNotify();

  // To begin, populate present invitations.
  // Announcers and announces that are already in the collection are readonly.
  useEffect(() => {
    const invitations = [...announces, ...announcers].reduce((acc, actorUri) => {
      const canView = announces.includes(actorUri);
      const canShare = announcers.includes(actorUri);
      return {
        ...acc,
        [actorUri]: {
          canView,
          canShare,
          viewReadonly: canView,
          shareReadonly: canShare
        }
      };
    }, {});
    setInvitations(invitations);
    setSavedInvitations(invitations);
  }, [announces, announcers, setInvitations, setSavedInvitations]);

  /** @param {Record<string, InvitationState} changedRights */
  const onChange = useCallback(
    changedRights => {
      // Compare changedRights to invitations, to know where we need to update the collection.
      const newInvitationsUnfiltered = {
        ...newInvitations,
        ...changedRights
      };
      const changedInvitations = Object.fromEntries(
        Object.entries(newInvitationsUnfiltered).filter(([actorUri, newInvitation]) => {
          const oldInvitation = savedInvitations[actorUri];
          return (
            !!newInvitation.canView !== (!!oldInvitation?.canView || !!oldInvitation?.canShare) ||
            !!newInvitation.canShare !== !!oldInvitation?.canShare
          );
        })
      );
      setNewInvitations(changedInvitations);

      setInvitations({
        ...savedInvitations,
        ...changedInvitations
      });
    },
    [newInvitations, savedInvitations]
  );

  const sendInvitations = useCallback(async () => {
    setSendingInvitation(true);
    const actorsWithNewViewRight = Object.keys(newInvitations).filter(
      actorUri => newInvitations[actorUri].canView && !newInvitations[actorUri].canShare
    );
    if (actorsWithNewViewRight.length > 0) {
      outbox.post({
        type: ACTIVITY_TYPES.ANNOUNCE,
        actor: outbox.owner,
        object: resourceUri,
        to: actorsWithNewViewRight
      });
    }

    const actorsWithNewShareRight = Object.keys(newInvitations).filter(actorUri => newInvitations[actorUri].canShare);
    if (actorsWithNewShareRight.length > 0) {
      outbox.post({
        type: ACTIVITY_TYPES.ANNOUNCE,
        actor: outbox.owner,
        object: resourceUri,
        to: actorsWithNewShareRight,
        'interop:delegationAllowed': true,
        'interop:delegationLimit': 1
      });
    }

    notify('apods.notification.invitation_sent', {
      type: 'success',
      messageArgs: { smart_count: Object.keys(newInvitations).length }
    });
    close();
  }, [outbox, notify, savedInvitations, newInvitations, isCreator, close, record, resourceUri, setSendingInvitation]);

  if (!identity) return null;

  return (
    <Dialog fullWidth={!xs} open={true} onClose={close} classes={{ paper: classes.dialogPaper }}>
      <DialogTitle className={classes.title}>{translate('apods.action.share')}</DialogTitle>
      <DialogContent className={classes.listForm}>
        <ContactsShareList
          invitations={invitations}
          onChange={onChange}
          organizerUri={creatorUri}
          isCreator={isCreator}
          profileResource={profileResource}
          groupResource={groupResource}
        />
      </DialogContent>
      <DialogActions className={classes.actions}>
        <Button variant="text" size="medium" onClick={close}>
          {translate('ra.action.close')}
        </Button>
        {Object.keys(newInvitations).length > 0 && (
          <Button
            variant="contained"
            color="primary"
            size="medium"
            onClick={sendInvitations}
            disabled={sendingInvitation}
          >
            {translate('apods.action.send_invitation', {
              smart_count: Object.keys(newInvitations).length
            })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ShareDialog;
