import React from 'react';
import { CreateButton, useTranslate, SimpleList } from 'react-admin';
import { Avatar, useMediaQuery } from "@material-ui/core";
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { AvatarWithLabelField } from '@semapps/field-components';
import { GridList } from '@semapps/list-components';
import List from "../../layout/List";
import ProfileCard from "../../common/cards/ProfileCard";
import ShareContactCard from "../../common/cards/ShareContactCard";
import { formatUsername } from "../../utils";
import ContactRequestsBlock from "../../common/blocks/ContactRequestsBlock";

const ProfileList = (props) => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  const xs = useMediaQuery(theme => theme.breakpoints.down('xs'), { noSsr: true });
  if (!identity?.id) return null;
  return (
    <List
      title={translate('app.page.contacts')}
      actions={[<CreateButton label="app.action.add_contact" />]}
      asides={[<ProfileCard />, <ShareContactCard />]}
      {...props}
    >
        {xs ?
          <>
            <ContactRequestsBlock />
            <SimpleList
              primaryText={record => record['vcard:given-name']}
              secondaryText={record => formatUsername(record.describes)}
              leftAvatar={record => (<Avatar src={record['vcard:photo']}>{record['vcard:given-name']?.toUpperCase()?.[0]}</Avatar>)}
              linkType="show"
              rowStyle={(record, index) => ({
                backgroundColor: 'white',
                padding: 8,
                marginBottom: 8,
                boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
              })}
            />
          </>
          :
          <>
            <ContactRequestsBlock />
            <GridList xs={4} sm={2} linkType="show">
              <AvatarWithLabelField
                label="vcard:given-name"
                image="vcard:photo"
                defaultLabel={translate('app.user.unknown')}
                labelColor="grey.300"
              />
            </GridList>
          </>
        }
    </List>
  );
}

export default ProfileList;
