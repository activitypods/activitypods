import React, { useState } from 'react';
import {
  SimpleForm,
  TextInput,
  useListController,
  Datagrid,
  ListContextProvider,
  TextField,
  useGetList,
  ListView,
  useTranslate,
  Button,
  useUpdate,
} from 'react-admin';
import { arrayFromLdField } from '../../utils';
import { Avatar } from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import { ReferenceField } from '@semapps/field-components';
import UsernameField from '../../common/fields/UsernameField';
import { Autocomplete } from '@material-ui/lab';

/**
 *
 * @param {Object} props
 * @param {import('react-admin').Identifier[]} props.selectedIds
 * @returns
 */
const RemoveFromListActionButton = (props) => {
  const { group, selectedIds } = props;
  const memberIds = arrayFromLdField(group['vcard:hasMember']);

  // Update resource and filter out all members that were selected.
  const [updateMembers, { loading }] = useUpdate('Group', group['id']);

  return (
    <Button
      onClick={() =>
        updateMembers('Group', group['id'], {
          // For the time being, the data provider does not support PATCH.
          // That's why we have to send the whole group object.
          ...group,
          'dc:modified': new Date().toISOString(),
          // Filter out selected ids (to be removed).
          'vcard:hasMember': memberIds.filter((memberId) => !selectedIds.includes(memberId)),
        })
      }
      label={'Remove from group'} // TODO: i18n
      disabled={loading}
    >
      {<DeleteIcon />}
    </Button>
  );
};

const AddMemberField = (props) => {
  const { group } = props;
  const memberIds = arrayFromLdField(group['vcard:hasMember']);
  const [value, setValue] = useState('');
  const translate = useTranslate();

  // First get all profiles.
  const { data, ids } = useGetList('Profile');
  // Then filter out all profiles that are already member of the group.
  const choices = ids.filter((id) => !memberIds.includes(id)).map((id) => data[id]);

  // Once a profile is selected, add it to the group with `updateMembers`.
  const [updateMembers, { loading }] = useUpdate('Group', group.id);

  return (
    <>
      <Autocomplete
        title="Add Members"
        placeHolder="Add Members"
        options={choices}
        getOptionLabel={(option) => option['vcard:given-name']}
        noOptionsText={translate('ra.navigation.no_results')}
        loading={loading}
        autoComplete
        blurOnSelect
        clearOnBlur
        disableClearable
        inputValue={value}
        onChange={(event, profile) => {
          console.log(profile);
          const newMemberIds = [...memberIds, profile.id];
          updateMembers('Group', group.id, {
            ...group,
            'dc:modified': new Date().toISOString(),
            'vcard:hasMember': newMemberIds,
          });
          setValue('');
        }}
        renderInput={(params) => <TextInput {...params} label="Add Members" source="vcard:hasMember" />}
      />
    </>
  );
};

export const GroupForm = (props) => {
  const translate = useTranslate();
  const { record } = props;
  const memberIds = arrayFromLdField(record['vcard:hasMember']);
  // First, we get all profiles
  const listControllerProps = useListController({ resource: 'Profile', basePath: '/profiles' });
  const { data: memberData, ids } = listControllerProps;
  // ... then we filter the profiles that are member of the current group.
  const sortedMemberIds = ids.filter((id) => memberIds.includes(id));

  // TODO: styling...
  return (
    <>
      {/* Show the name of the group (editable) */}
      <SimpleForm {...props} redirect="list">
        <TextInput source="vcard:label" fullWidth />

        {/* Custom title element for the list view */}
        <h3>{translate('app.groups.members')}</h3>
        <ListContextProvider value={{ ...listControllerProps, ids: sortedMemberIds, data: memberData }}>
          {/* Prevent the toolbar from taking space when it's collapsed */}
          <ListView
            title={translate('app.groups.members')}
            exporter={false}
            hasCreate={false}
            bulkActionButtons={<RemoveFromListActionButton group={record} />}
            fullwidth="true"
          >
            <Datagrid>
              <ReferenceField label={'Name'} source="id" reference="Profile" basePath={'/Group'}>
                <Avatar
                  source="vcard:photo"
                  label="Avatar"
                  // TODO: The style shouldn't be green from the link.
                />
              </ReferenceField>
              <ReferenceField label={'Name'} source="id" reference="Profile" basePath={'/Group'}>
                <TextField source="vcard:given-name" fullWidth />
              </ReferenceField>
              <UsernameField source="describes" label="Address" />
            </Datagrid>
          </ListView>
        </ListContextProvider>
        <AddMemberField group={record}></AddMemberField>
      </SimpleForm>
    </>
  );
};

export default GroupForm;
