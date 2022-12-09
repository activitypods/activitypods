import React from 'react';
import { ListBase, useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { AvatarWithLabelField } from '@semapps/field-components';
import { GridList } from '@semapps/list-components';
import List from "../../layout/List";
import ProfileCard from "../../common/cards/ProfileCard";
import ShareContactCard from "../../common/cards/ShareContactCard";

const ProfileList = (props) => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity?.id) return null;
  return (
    <List aside={[
      <ProfileCard />,
      <ShareContactCard />
    ]} {...props}>
      {/*<ContactRequestsBlock />*/}
      <ListBase
        resource="Profile"
        basePath="/Profile"
        perPage={1000}
        sort={{ field: 'vcard:given-name', order: 'ASC' }}
      >
        <GridList xs={4} sm={2} linkType="show">
          <AvatarWithLabelField
            label="vcard:given-name"
            image="vcard:photo"
            defaultLabel={translate('app.user.unknown')}
            labelColor="grey.300"
          />
        </GridList>
      </ListBase>
    </List>
  );
}

export default ProfileList;
