import React from 'react';
import { TextField, DateField, useTranslate } from 'react-admin';
import Show from '../../layout/Show';
import ProfileTitle from './ProfileTitle';
import Hero from '../../common/list/Hero/Hero';
import ContactCard from '../../common/cards/ContactCard';
import UsernameField from '../../common/fields/UsernameField';
import ContactField from '../../common/fields/ContactField';
import MainList from '../../common/list/MainList/MainList';
import G1AccountField from '../../common/fields/G1AccountField';
import BlockAnonymous from '../../common/BlockAnonymous';
import { TagsListEdit } from '@semapps/tag-components';

const ProfileShow = (props) => {
  const translate = useTranslate();

  return (
    <BlockAnonymous>
      <Show title={<ProfileTitle />} asides={[<ContactCard />]} {...props}>
        <Hero image="vcard:photo">
          <TagsListEdit
            source="id"
            addLabel={true}
            label={'Groups'}
            relationshipPredicate="vcard:hasMember"
            namePredicate="vcard:label"
            avatarPredicate="vcard:photo"
            tagResource="Group"
          />

          <TextField source="vcard:given-name" />
          <UsernameField source="describes" />
          <TextField source="vcard:note" />
          <G1AccountField source="foaf:tipjar" />
          <DateField
            source="dc:created"
            locales={process.env.REACT_APP_LANG}
            options={{ month: 'long', day: 'numeric', year: 'numeric' }}
          />
        </Hero>

        <MainList>
          <ContactField source="describes" label={translate('app.action.send_message')} />
        </MainList>
      </Show>
    </BlockAnonymous>
  );
};

export default ProfileShow;
