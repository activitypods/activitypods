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
} from 'react-admin';
import { useField } from 'react-final-form';
import { arrayFromLdField } from '../../utils';
import { Avatar } from '@material-ui/core';
import PersonIcon from '@material-ui/icons/Person';
import GroupIcon from '@material-ui/icons/Group';
import DeleteIcon from '@material-ui/icons/Delete';
import { ReferenceField } from '@semapps/field-components';
import UsernameField from '../../common/fields/UsernameField';

import ResourceSelectWithTags from '../../common/inputs/ResourceSelectWithTags';

export const GroupFormContent = (props) => {
  const translate = useTranslate();

  const { record: group } = props;
  const [memberIds, setMemberIds] = React.useState(arrayFromLdField(group['vcard:hasMember']));
  const [sort, setSort] = React.useState({ field: 'vcard:given-name', order: 'ASC' });

  // First, we get all profiles
  const listControllerProps = useListController({ resource: 'Profile', basePath: '/profiles' });
  const unselectMemberIds = useUnselectAll('Profile');

  const { data: memberData, ids, loading } = listControllerProps;

  const sortedMemberIds = ids
    .filter((id) => memberIds.includes(id))
    .sort(
      (id1, id2) =>
        (memberData[id1]?.['vcard:given-name'] || '').localeCompare(memberData[id2]?.['vcard:given-name'] || '') *
        (sort.order === 'ASC' ? 1 : -1)
    );

  const onMemberChange = ({ ids }) => {
    setMemberIds(ids);
  };
  /** @param {Identifier[]} removeIds */
  const onDeleteMembers = (removeIds) => {
    setMemberIds(memberIds.filter((id) => !removeIds.includes(id)));
  };

  const { input: memberInput } = useField('vcard:hasMember');
  useEffect(() => {
    memberInput.onChange(memberIds);
  }, [memberIds, memberInput]);

  return (
    <>
      <TextInput source="vcard:label" fullWidth label={translate('app.group.label')} />
      {/* Custom title element for the list view */}
      <h3>{translate('app.group.members')}</h3>
      <ResourceSelectWithTags
        title="Add Members"
        labelResourcePredicate="vcard:given-name"
        labelTagPredicate="vcard:label"
        relationshipPredicate="vcard:hasMember"
        avatarResourcePredicate="vcard:photo"
        avatarTagPredicate="vcard:hasPhoto"
        resourceDefaultIcon={<PersonIcon />}
        tagDefaultIcon={<GroupIcon />}
        renderTags={() => null}
        entityResource="Profile"
        tagResource="Group"
        tagName={translate('app.group.group')}
        resourceName={translate('app.group.profile')}
        value={memberIds}
        // We have a custom datagrid to render the selected users so don't show them here.
        onSelectionChange={onMemberChange}
        loading={loading}
        excludeIds={group.id && [group.id]}
      />
      <ListContextProvider value={{ ...listControllerProps, ids: sortedMemberIds, data: memberData }}>
        {/* Prevent the toolbar from taking space when it's collapsed */}
        <ListView
          title={translate('app.group.members')}
          loading={loading}
          exporter={false}
          hasCreate={false}
          sort={sort}
          setSort={(field, order) => setSort({ field: field, order: sort.order === 'ASC' ? 'DESC' : 'ASC' })}
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
              <Avatar source="vcard:photo" label="Avatar" />
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
