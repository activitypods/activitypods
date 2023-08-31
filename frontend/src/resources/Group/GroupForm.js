import React, { useEffect } from 'react';
import {
  SimpleForm,
  TextInput,
  useListController,
  Datagrid,
  ListContextProvider,
  TextField,
  ListView,
  useTranslate,
  Button,
  useUnselectAll,
  useRecordContext,
} from 'react-admin';
import { useField } from 'react-final-form';
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

export const GroupFormContent = (props) => {
  const translate = useTranslate();

  const { record: group } = props;
  // Watch out: group['vcard:hasMember'] contains the actor URIs, not the profile URIs.
  const [memberIds, setMemberIds] = React.useState(arrayFromLdField(group['vcard:hasMember']));
  const [sort, setSort] = React.useState({ field: 'vcard:given-name', order: 'ASC' });

  // First, we get all profiles
  const listControllerProps = useListController({ resource: 'Profile', basePath: '/profiles' });
  const unselectMemberIds = useUnselectAll('Profile');

  const { data: profileData, ids: profileIds, loading } = listControllerProps;

  const sortedProfileIds = profileIds
    .filter((id) => memberIds.includes(profileData[id]?.['describes']))
    .sort(
      (id1, id2) =>
        (profileData[id1]?.['vcard:given-name'] || '').localeCompare(profileData[id2]?.['vcard:given-name'] || '') *
        (sort.order === 'ASC' ? 1 : -1)
    );

  const onMemberChange = ({ ids: newProfileIds }) => {
    const changedMemberIds = newProfileIds.map((profileId) => profileData[profileId]?.describes);
    setMemberIds(changedMemberIds);
  };
  /** @param {Identifier[]} removeProfileIds */
  const onDeleteMembers = (removeProfileIds) => {
    const removeMemberIds = removeProfileIds.map((id) => profileData[id]?.describes);
    setMemberIds(memberIds.filter((id) => !removeMemberIds.includes(id)));
  };

  // We use this, to store the memberIds in the form.
  const { input: memberInput } = useField('vcard:hasMember');
  useEffect(() => {
    memberInput.onChange(memberIds);
  }, [memberIds, memberInput]);

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
        value={sortedProfileIds}
        onSelectionChange={onMemberChange}
        // The groups's appearance suffices, so we don't need to label.
        groupBy={() => ''}
        loading={loading}
        excludeIds={group.id && [group.id]}
      />
      {/* We use a custom datagrid to render the selected users. `ids` gets the selected ones only. */}
      <ListContextProvider value={{ ...listControllerProps, ids: sortedProfileIds, data: profileData }}>
        <ListView
          title={translate('app.group.members')}
          loading={loading}
          exporter={false}
          hasCreate={false}
          sort={sort}
          setSort={(field) => setSort({ field: field, order: sort.order === 'ASC' ? 'DESC' : 'ASC' })}
          actions={false}
          bulkActionButtons={
            <Button
              onClick={() => {
                onDeleteMembers(listControllerProps.selectedIds);
                unselectMemberIds();
              }}
              label={translate('app.group.remove_members')}
              disabled={loading}
              style={{ color: 'red' }}
            >
              {<DeleteIcon />}
            </Button>
          }
          fullwidth="true"
          pagination={false}
        >
          <Datagrid empty={<>{translate('app.group.no_members')}</>}>
            <ReferenceField label="Avatar" source="id" reference="Profile" basePath={'/Group'} sortable={false}>
              <AvatarItem source="vcard:photo" label="vcard:given-name" />
            </ReferenceField>
            <ReferenceField
              label={'Name'}
              source="id"
              reference="Profile"
              basePath={'/Group'}
              sortBy="vcard:given-name"
              sortByOrder={sort.order}
            >
              <TextField source="vcard:given-name" label={translate('app.group.profile_name')} fullWidth />
            </ReferenceField>
            <UsernameField source="describes" label="Address" sortable={false} />
          </Datagrid>
        </ListView>
      </ListContextProvider>
    </>
  );
};

const GroupForm = (props) => {
  return (
    <SimpleForm
      {...props}
      redirect="list"
      style={{ 'MuiIconButton-root': { paddingRight: '8px', backgroundColor: 'inherit' } }}
    >
      <GroupFormContent {...props} />
    </SimpleForm>
  );
};

export default GroupForm;
