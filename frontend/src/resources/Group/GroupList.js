import React from 'react';
import { useTranslate, SimpleList, TextField, DeleteWithUndoButton } from 'react-admin';
import GroupIcon from '@material-ui/icons/Group';
import List from '../../layout/List';
import { arrayFromLdField } from '../../utils';

const GroupList = (props) => {
  const translate = useTranslate();

  // TODO: Styling

  return (
    <>
      <List {...props}>
        <SimpleList
          primaryText={<TextField source="vcard:label" />}
          secondaryText={(record) =>
            `${translate('app.groups.members')}: ${arrayFromLdField(record['vcard:hasMember']).length}`
          }
          linkType={'edit'}
          // rowStyle={postRowStyle}
          leftIcon={() => <GroupIcon />}
          rightIcon={(record) => <DeleteWithUndoButton record={record}></DeleteWithUndoButton>}
        />
      </List>
    </>
  );
};

export default GroupList;
