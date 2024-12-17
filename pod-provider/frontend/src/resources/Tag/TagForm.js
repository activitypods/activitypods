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
  required,
  ShowButton,
  useCreatePath
} from 'react-admin';
import { useFormContext } from 'react-hook-form';
import { Avatar, ListItemAvatar, useMediaQuery } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import { ReferenceField } from '@semapps/field-components';
import { arrayOf } from '../../utils';
import UsernameField from '../../common/fields/UsernameField';
import ResourceSelectWithTags from '../../common/tags/ResourceSelectWithTags';

const arraysEqual = (arr1, arr2) =>
  arr1?.length === arr2?.length && arr1.every((value, index) => value === arr2[index]);

const AvatarItem = ({ source }) => {
  const record = useRecordContext();
  return (
    <ListItemAvatar>
      <Avatar src={record[source]}>
        <PersonIcon />
      </Avatar>
    </ListItemAvatar>
  );
};

export const TagFormContent = () => {
  const translate = useTranslate();
  const createPath = useCreatePath();
  const isSmall = useMediaQuery(theme => theme.breakpoints.down('sm'));

  const group = useRecordContext();
  // Watch out: group['vcard:hasMember'] contains the actor URIs, not the profile URIs.
  const [memberIds, setMemberIds] = React.useState(arrayOf(group?.['vcard:hasMember']));

  const listControllerProps = useListController({
    resource: 'Profile',
    disableSyncWithLocation: true,
    page: 1,
    perPage: Infinity
  });
  const { data: profileData, isLoading } = listControllerProps;
  const profileToMemberId = useMemo(
    () => Object.fromEntries(profileData?.map(p => [p.id, p.describes]) || []),
    [profileData]
  );
  const filteredProfileData = useMemo(
    () => profileData?.filter(p => memberIds.includes(p?.describes)),
    [profileData, memberIds]
  );

  // We use the form context, to add add the group members to the form.
  const form = useFormContext();

  const unselectMemberIds = useUnselectAll('Profile');

  /** @param {{ ids: Identifier[] }} newProfileIds */
  const onMemberChange = useCallback(
    ({ ids: newProfileIds }) => {
      const changedMemberIds = newProfileIds.map(profileId => profileToMemberId[profileId]);
      setMemberIds(changedMemberIds);
    },
    [profileToMemberId, setMemberIds]
  );
  /** @param {Identifier[]} removeProfileIds */
  const onDeleteMembers = useCallback(
    removeProfileIds => {
      const removeMemberIds = removeProfileIds.map(id => profileData.find(p => p.id === id)?.describes);
      setMemberIds(memberIds.filter(id => !removeMemberIds.includes(id)));
    },
    [profileData, memberIds, setMemberIds]
  );

  // We use this to store the memberIds in the form, since they don't have a dedicated component for this.
  useEffect(() => {
    if (!arraysEqual(memberIds, form.getValues()['vcard:hasMember'])) {
      form.setValue('vcard:hasMember', memberIds, { shouldDirty: true });
    }
  }, [memberIds, form]);

  return (
    <>
      <TextInput source="vcard:label" fullWidth label={translate('app.tag.label')} validate={[required()]} />
      <h3>{translate('app.tag.members')}</h3>
      <ResourceSelectWithTags
        title={translate('app.tag.add_members')}
        labelResourcePredicate="vcard:given-name"
        labelTagPredicate="vcard:label"
        relationshipPredicate="vcard:hasMember"
        avatarResourcePredicate="vcard:photo"
        avatarTagPredicate="vcard:photo"
        ownerIdResourcePredicate="describes"
        resourceDefaultIcon={<PersonIcon />}
        tagDefaultIcon={<SellOutlinedIcon />}
        // We have a custom datagrid to render the selected users so don't show them here.
        renderTags={() => null}
        entityResource="Profile"
        tagResource="Tag"
        tagName={translate('app.tag.group')}
        resourceName={translate('app.tag.profile')}
        // The selected member ids.
        value={filteredProfileData?.map(p => p.id) || []}
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
          title={translate('app.tag.members')}
          hasCreate={false}
          actions={false}
          pagination={false}
          sx={{ width: '100%' }}
          empty={<>{translate('app.tag.no_members')}</>}
        >
          {isSmall ? (
            <SimpleList
              empty={<>{translate('app.tag.no_members')}</>}
              leftIcon={() => <AvatarItem source="vcard:photo" label="vcard:given-name" />}
              primaryText={() => <TextField source="vcard:given-name" label={translate('app.tag.profile_name')} />}
              linkType={record => createPath({ resource: 'Profile', type: 'show', id: record?.id })}
            />
          ) : (
            <Datagrid
              bulkActionButtons={
                <Button
                  onClick={() => {
                    onDeleteMembers(listControllerProps.selectedIds);
                    unselectMemberIds();
                  }}
                  label={translate('app.tag.remove_members')}
                  disabled={isLoading}
                  sx={{ color: 'red' }}
                >
                  <DeleteIcon />
                </Button>
              }
            >
              <AvatarItem source="vcard:photo" label="" sortable={false} />
              <TextField label={translate('app.tag.profile_name')} source="vcard:given-name" />
              <ReferenceField
                source="describes"
                reference="Actor"
                label={translate('app.input.user_id')}
                sortable={false}
                link={false}
              >
                <UsernameField showCopyButton={false} />
              </ReferenceField>
              <ShowButton resource="Profile" color="black" />
            </Datagrid>
          )}
        </ListView>
      </ListContextProvider>
    </>
  );
};

const TagForm = props => (
  <SimpleForm
    redirect="list"
    style={{ MuiIconButtonRoot: { paddingRight: '8px', backgroundColor: 'inherit' } }}
    {...props}
  >
    <TagFormContent />
  </SimpleForm>
);

export default TagForm;
