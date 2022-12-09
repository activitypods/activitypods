import React from 'react';
import { TextField, DateField, useTranslate } from 'react-admin';
import Show from "../../layout/Show";
import ProfileTitle from "./ProfileTitle";
import Hero from "../../common/list/Hero/Hero";
import ContactCard from "../../common/cards/ContactCard";
import UsernameField from "../../common/fields/UsernameField";
import ContactField from "../../common/fields/ContactField";
import MainList from "../../common/list/MainList/MainList";
import G1AccountField from "../../common/fields/G1AccountField";

const ProfileShow = (props) => {
  const translate = useTranslate();
  return (
    <Show title={<ProfileTitle />} aside={<ContactCard />} {...props}>
      <Hero image="vcard:photo">
        <TextField source="vcard:given-name" />
        <UsernameField source="describes" />
        <TextField source="vcard:note" />
        <DateField source="dc:created" options={{ month: 'long', day: 'numeric', year: 'numeric' }} />
        <G1AccountField source="foaf:tipjar" label={translate('app.block.g1_account')} />
      </Hero>
      <MainList>
        <ContactField source="describes" label={translate('app.action.send_message')} />
      </MainList>
    </Show>
  );
}

export default ProfileShow;
