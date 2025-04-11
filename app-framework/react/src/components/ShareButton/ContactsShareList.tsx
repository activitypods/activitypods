import React, { useState, useMemo } from 'react';
import { useGetList, useTranslate, useGetIdentity } from 'react-admin';
import { List, Box, CircularProgress, TextField, Alert } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import ContactItem from './ContactItem';
import GroupContactsItem from './GroupContactsItem';
import { formatUsername } from '../../utils';

/**
 * @typedef {import('./ShareDialog').InvitationState} InvitationState
 */

const useStyles = makeStyles(theme => ({
  list: {
    width: '98%',
    maxWidth: '98%',
    // @ts-ignore
    backgroundColor: theme.palette.background.paper,
    padding: 0
  }
}));

/**
 * @param {Object} props
 * @param {Record<string, InvitationState} props.invitations
 * @param {(invitations: Record<string, InvitationState) => void} props.onChange
 * @param {boolean} props.isCreator
 */
const ContactsShareList = ({
  invitations,
  onChange,
  organizerUri,
  isCreator,
  profileResource,
  groupResource
}: {
  invitations: Record<string, any>;
  organizerUri: string;
  onChange: (invitations: Record<string, any>) => void;
  isCreator: boolean;
  profileResource: any;
  groupResource: any;
}) => {
  const classes = useStyles();
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const [searchText, setSearchText] = useState('');

  const { data: profilesData, isLoading: loadingProfiles } = useGetList(profileResource, {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'vcard:given-name', order: 'ASC' }
  });
  const { data: groupsData, isLoading: loadingGroups } = useGetList(groupResource, {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: 'vcard:label', order: 'ASC' }
  });

  // Filter here (instead of using the `filter.q` param above) to avoid triggering a SPARQL query on every character change
  const profilesFiltered = useMemo(
    () =>
      profilesData
        ?.filter(profile => profile.describes !== organizerUri && profile.describes !== identity?.id)
        .filter(
          profile =>
            (profile['vcard:given-name'] || '').toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            formatUsername(profile.describes).toLocaleLowerCase().includes(searchText.toLocaleLowerCase())
        ),
    [profilesData, searchText, organizerUri, identity]
  );
  const groupsFiltered = useMemo(() => {
    return groupsData?.filter(group =>
      (group['vcard:label'] || '').toLocaleLowerCase().includes(searchText.toLocaleLowerCase())
    );
  }, [groupsData, searchText]);

  return (
    <List dense className={classes.list}>
      <TextField
        type="search"
        value={searchText}
        onChange={event => setSearchText(event.target.value)}
        label={translate('apods.action.search')}
        fullWidth
        size="small"
        margin="dense"
      />
      {groupsFiltered?.map(group => (
        <GroupContactsItem
          key={group.id}
          group={group}
          invitations={invitations}
          onChange={onChange}
          isCreator={isCreator}
        />
      ))}
      {profilesFiltered?.map(profile => (
        <ContactItem
          key={profile.id}
          record={profile}
          invitation={invitations[profile.describes]}
          onChange={onChange}
          isCreator={isCreator}
        />
      ))}
      {(loadingProfiles || loadingGroups) && (
        <Box display="flex" alignItems="center" justifyContent="center" height={250}>
          <CircularProgress size={60} thickness={6} />
        </Box>
      )}
      {!loadingProfiles && profilesFiltered?.length !== 0 && (
        <Alert severity="warning">{translate('apods.helper.no_contact')}</Alert>
      )}
    </List>
  );
};

export default ContactsShareList;
