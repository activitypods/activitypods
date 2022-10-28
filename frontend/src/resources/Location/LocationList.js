import React from 'react';
import { ListBase, SimpleList, useTranslate } from 'react-admin';
import HomeIcon from '@material-ui/icons/Home';
import { Box, Container } from '@material-ui/core';
import HeaderTitle from '../../layout/HeaderTitle';
import Alert from '@material-ui/lab/Alert';

const LocationList = (props) => {
  const translate = useTranslate();
  return (
    <>
      <HeaderTitle actions={{"/Location/create": translate('app.action.add')}}>
        {translate('app.page.addresses')}
      </HeaderTitle>
      <br />
      <Container>
        <Box mb={1}>
          <Alert severity="info">{translate('app.helper.addresses_visibility')}</Alert>
        </Box>
        <ListBase {...props}>
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
        </ListBase>
      </Container>
    </>
  );
};

export default LocationList;
