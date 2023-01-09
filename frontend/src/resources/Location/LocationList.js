import React from 'react';
import { SimpleList, useTranslate } from 'react-admin';
import HomeIcon from '@material-ui/icons/Home';
import List from '../../layout/List';

const LocationList = (props) => {
  const translate = useTranslate();
  return (
    <List title={translate('app.page.addresses')} {...props}>
      <SimpleList
        primaryText={(record) => record['vcard:given-name']}
        secondaryText={(record) => record['vcard:hasAddress']?.['vcard:given-name']}
        leftAvatar={() => <HomeIcon />}
        rowStyle={() => ({
          backgroundColor: 'white',
          padding: 16,
          marginBottom: 15,
          boxShadow:
            '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
        })}
      />
    </List>
  );
}

export default LocationList;
