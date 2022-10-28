import React from 'react';
import { ShowBase, useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import ProfileHeader from './ProfileHeader';
import BodyList from '../../commons/lists/BodyList/BodyList';
import ContactField from '../../commons/fields/ContactField';
import G1AccountField from "../../commons/fields/G1AccountField";
import ContactCard from "../../commons/cards/ContactCard";

const ProfileShow = (props) => {
  useCheckAuthenticated();
  const translate = useTranslate();
  return (
    <ShowBase {...props}>
      <>
        <ProfileHeader />
        <BodyList
          aside={<ContactCard />}
        >
          <ContactField source="describes" label={translate('app.action.send_message')} />
          <G1AccountField source="foaf:tipjar" label={translate('app.block.g1_account')} />
        </BodyList>
      </>
    </ShowBase>
  );
};

export default ProfileShow;
