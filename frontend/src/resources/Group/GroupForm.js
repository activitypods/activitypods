import React, { useEffect, useMemo, useCallback } from 'react';
import {
  SimpleForm,
  TextInput,
  Datagrid,
  ListContextProvider,
  TextField,
  ListView,
  useTranslate,
  Button,
  useUnselectAll,
  useRecordContext,
  useListController,
  SimpleList,
} from 'react-admin';
import { useFormContext } from 'react-hook-form';
import { arrayFromLdField } from '../../utils';
import { Avatar, ListItemAvatar, useMediaQuery } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';
import { ReferenceField } from '@semapps/field-components';
import UsernameField from '../../common/fields/UsernameField';
import ResourceSelectWithTags from '../../common/tags/ResourceSelectWithTags';

const arraysEqual = (arr1, arr2) =>
  arr1?.length === arr2?.length && arr1.every((value, index) => value === arr2[index]);

const AvatarItem = ({ source, label }) => {
  const record = useRecordContext();
  return (
    <ListItemAvatar>
      <Avatar src={record[source]}>
        <PersonIcon />
      </Avatar>
    </ListItemAvatar>
  );
};

export const GroupFormContent = () => {
  const translate = useTranslate();
  const isSmall = useMediaQuery((theme) => theme.breakpoints.down('sm'));

  const group = useRecordContext();
  // Watch out: group['vcard:hasMember'] contains the actor URIs, not the profile URIs.
  const [memberIds, setMemberIds] = React.useState(arrayFromLdField(group?.['vcard:hasMember']));

  const listControllerProps = useListController({
    resource: 'Profile',
    disableSyncWithLocation: true,
  });
  const { data: profileData, isLoading } = listControllerProps;
  const profileToMemberId = useMemo(
    () => Object.fromEntries(profileData?.map((p) => [p.id, p.describes]) || []),
    [profileData]
  );
  const filteredProfileData = useMemo(
    () => profileData?.filter((p) => memberIds.includes(p?.['describes'])),
    [profileData, memberIds]
  );

  // We use the form context, to add add the group members to the form.
  const form = useFormContext();

  const unselectMemberIds = useUnselectAll('Profile');

  /** @param {{ ids: Identifier[] }} newProfileIds */
  const onMemberChange = useCallback(
    ({ ids: newProfileIds }) => {
      const changedMemberIds = newProfileIds.map((profileId) => profileToMemberId[profileId]);
      setMemberIds(changedMemberIds);
    },
    [profileToMemberId, setMemberIds]
  );
  /** @param {Identifier[]} removeProfileIds */
  const onDeleteMembers = useCallback(
    (removeProfileIds) => {
      const removeMemberIds = removeProfileIds.map((id) => profileData.find((p) => p.id === id)?.describes);
      setMemberIds(memberIds.filter((id) => !removeMemberIds.includes(id)));
    },
    [profileData, memberIds, setMemberIds]
  );

  // We use this to store the memberIds in the form, since they don't have a dedicated component for this.
  useEffect(() => {
    if (!arraysEqual(memberIds, form.getValues()?.['vcard:hasMember'])) {
      form.setValue('vcard:hasMember', memberIds, { shouldDirty: true });
    }
  }, [memberIds, form]);

  return (
    <>
      <TextInput source="vcard:label" fullWidth label={translate('app.group.label')} />
      <h3>{translate('app.group.members')}</h3>
      <ResourceSelectWithTags
        title={translate('app.group.add_members')}
        labelResourcePredicate="vcard:given-name"
        labelTagPredicate="vcard:label"
        relationshipPredicate="vcard:hasMember"
        avatarResourcePredicate="vcard:photo"
        avatarTagPredicate="vcard:photo"
        ownerIdResourcePredicate="describes"
        resourceDefaultIcon={<PersonIcon />}
        tagDefaultIcon={<GroupIcon />}
        // We have a custom datagrid to render the selected users so don't show them here.
        renderTags={() => null}
        entityResource="Profile"
        tagResource="Group"
        tagName={translate('app.group.group')}
        resourceName={translate('app.group.profile')}
        // The selected member ids.
        value={filteredProfileData?.map((p) => p.id) || []}
        onSelectionChange={onMemberChange}
        // The groups's appearance suffices, so we don't need to label.
        groupBy={() => ''}
        loading={isLoading}
        excludeIds={group ? [group.id] : []}
      />
      {/* We use a custom datagrid to render the selected users. */}
      <ListContextProvider
        value={{ ...listControllerProps, data: filteredProfileData, total: filteredProfileData?.length }}
      >
        <ListView
          title={translate('app.group.members')}
          hasCreate={false}
          actions={false}
          pagination={false}
          sx={{ width: '100%' }}
          empty={<>{translate('app.group.no_members')}</>}
        >
          {isSmall ? (
            <SimpleList
              empty={<>{translate('app.group.no_members')}</>}
              // leftIcon={() => <PersonIcon />}
              leftIcon={(props) => (
                <ReferenceField label="Avatar" source="id" reference="Profile" basePath={'/Group'} sortable={false}>
                  <AvatarItem source="vcard:photo" label="vcard:given-name" />
                </ReferenceField>
              )}
              primaryText={() => (
                <ReferenceField source="id" reference="Profile" basePath={'/Group'} sortBy="vcard:given-name">
                  <TextField source="vcard:given-name" label={translate('app.group.profile_name')} fullWidth />
                </ReferenceField>
              )}
              linkType={() => ''}
            />
          ) : (
            <Datagrid
              bulkActionButtons={
                <>
                  <Button
                    onClick={() => {
                      onDeleteMembers(listControllerProps.selectedIds);
                      unselectMemberIds();
                    }}
                    label={translate('app.group.remove_members')}
                    disabled={isLoading}
                    sx={{ color: 'red' }}
                  >
                    {<DeleteIcon />}
                  </Button>
                </>
              }
            >
              <ReferenceField label="" source="id" reference="Profile" sortable={false} link="show">
                <AvatarItem source="vcard:photo" label="vcard:given-name" />
              </ReferenceField>
              <ReferenceField
                label={translate('app.group.profile_name')}
                source="id"
                reference="Profile"
                sortBy="vcard:given-name"
                link="show"
              >
                <TextField source="vcard:given-name" label={translate('app.group.profile_name')} fullWidth />
              </ReferenceField>
              <UsernameField
                source="describes"
                label={translate('app.input.user_id')}
                sortable={false}
                showCopyButton={false}
              />
            </Datagrid>
          )}
        </ListView>
      </ListContextProvider>
    </>
  );
};

const GroupForm = (props) => {
  return (
    <SimpleForm
      redirect="list"
      style={{ MuiIconButtonRoot: { paddingRight: '8px', backgroundColor: 'inherit' } }}
      {...props}
    >
      <GroupFormContent />
    </SimpleForm>
  );
};

export default GroupForm;
