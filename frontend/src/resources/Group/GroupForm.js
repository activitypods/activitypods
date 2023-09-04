import React, { useEffect } from 'react';
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
} from 'react-admin';
import { useFormContext } from "react-hook-form";
import { arrayFromLdField } from '../../utils';
import { Avatar, ListItemAvatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';
import { ReferenceField } from '@semapps/field-components';
import UsernameField from '../../common/fields/UsernameField';
import ResourceSelectWithTags from '../../common/tags/ResourceSelectWithTags';

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
  const form = useFormContext();

  const group = useRecordContext();
  // Watch out: group['vcard:hasMember'] contains the actor URIs, not the profile URIs.
  const [memberIds, setMemberIds] = React.useState(arrayFromLdField(group?.['vcard:hasMember']));
  const [sort, setSort] = React.useState({ field: 'vcard:given-name', order: 'ASC' });

  // First, we get all profiles
  const listControllerProps = useListController({ resource: 'Profile', sort });
  const unselectMemberIds = useUnselectAll('Profile');
  const { data: profileData, isLoading } = listControllerProps;

  const filteredProfileData = profileData?.filter(p => memberIds.includes(p?.['describes']));

  const onMemberChange = ({ ids: newProfileIds }) => {
    const changedMemberIds = newProfileIds.map((profileId) => profileData[profileId]?.describes);
    setMemberIds(changedMemberIds);
  };
  /** @param {Identifier[]} removeProfileIds */
  const onDeleteMembers = (removeProfileIds) => {
    const removeMemberIds = removeProfileIds.map((id) => profileData.find(p => p.id === id)?.describes);
    setMemberIds(memberIds.filter((id) => !removeMemberIds.includes(id)));
  };

  // We use this to store the memberIds in the form.
  useEffect(() => {
    form.setValue('vcard:hasMember', memberIds, { shouldDirty: true });
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
        // The selected members.
        value={filteredProfileData?.map(p => p.id)}
        onSelectionChange={onMemberChange}
        // The groups's appearance suffices, so we don't need to label.
        groupBy={() => ''}
        loading={isLoading}
        excludeIds={group ? [group.id] : []}
      />
      {/* We use a custom datagrid to render the selected users. */}
      <ListContextProvider value={{ ...listControllerProps, data: filteredProfileData, total: filteredProfileData?.length }}>
        <ListView
          title={translate('app.group.members')}
          hasCreate={false}
          actions={false}
          pagination={false}
          sx={{ width: '100%' }}
        >
          <Datagrid 
            empty={<>{translate('app.group.no_members')}</>}
            bulkActionButtons={
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
            }  
            rowClick="show"
          >
            <ReferenceField label="Avatar" source="id" reference="Profile" sortable={false} link="show">
              <AvatarItem source="vcard:photo" label="vcard:given-name" />
            </ReferenceField>
            <ReferenceField
              label="Name"
              source="id"
              reference="Profile"
              sortBy="vcard:given-name"
              sortByOrder={sort.order}
              link="show"
            >
              <TextField source="vcard:given-name" label={translate('app.group.profile_name')} fullWidth />
            </ReferenceField>
            <UsernameField source="describes" label="Address" sortable={false} showCopyButton={false} />
          </Datagrid>
        </ListView>
      </ListContextProvider>
    </>
  );
};

const GroupForm = (props) => {
  return (
    <SimpleForm
      redirect="list"
      style={{ 'MuiIconButton-root': { paddingRight: '8px', backgroundColor: 'inherit' } }}
      {...props}
    >
      <GroupFormContent />
    </SimpleForm>
  );
};

export default GroupForm;
