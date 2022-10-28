import React from 'react';
import { ListBase, Pagination, SimpleList } from 'react-admin';
import { Container, Card, CardContent, CardHeader } from '@material-ui/core';
import { useCheckAuthenticated } from '@semapps/auth-provider';

const ProfileList = (props) => {
  const { identity } = useCheckAuthenticated();
  if (!identity?.id) return null;
  return (
    <Container>
      <Card>
        <CardHeader title="Mon réseau" />
        <CardContent>
          <ListBase {...props}>
            <SimpleList
              primaryText={record => record['vcard:given-name']} />
          </ListBase>
          <Pagination />
        </CardContent>
      </Card>
    </Container>
  );
};

export default ProfileList;
