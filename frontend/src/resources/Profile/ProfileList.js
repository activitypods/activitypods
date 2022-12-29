import React from 'react';
import { CreateButton, useTranslate, SimpleList } from 'react-admin';
import { Avatar, useMediaQuery } from "@material-ui/core";
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { AvatarWithLabelField } from '@semapps/field-components';
import { GridList } from '@semapps/list-components';
import List from "../../layout/List";
import ProfileCard from "../../common/cards/ProfileCard";
import ShareContactCard from "../../common/cards/ShareContactCard";
import {formatUsername} from "../../utils";

const ProfileList = (props) => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  const xs = useMediaQuery(theme => theme.breakpoints.down('xs'), { noSsr: true });
  if (!identity?.id) return null;
  return (
    <List actions={[<CreateButton label="Ajouter un contact" />]} aside={[
      <ProfileCard />,
      <ShareContactCard />
    ]} {...props}>
        {xs ?
          <SimpleList
            primaryText={record => record['vcard:given-name']}
            secondaryText={record => formatUsername(record.describes)}
            leftAvatar={record => (<Avatar src={record['vcard:photo']}>{record['vcard:given-name'].toUpperCase()}</Avatar>)}
            linkType="show"
            rowStyle={(record, index) => ({
              paddingLeft: 8,
              paddingRight: 8,
              backgroundColor: index % 2 ? '#efe' : 'white',
            })}
          />
          :
          <GridList xs={4} sm={2} linkType="show">
          <AvatarWithLabelField
            label="vcard:given-name"
            image="vcard:photo"
            defaultLabel={translate('app.user.unknown')}
            labelColor="grey.300"
          />
        </GridList>
        }
    </List>
  );
}

export default ProfileList;
