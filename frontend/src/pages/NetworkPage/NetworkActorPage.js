import React, { useEffect, useState } from 'react';
import { TextField, DateField, ReferenceField, useTranslate, Button } from 'react-admin';
import { useParams, Link } from 'react-router-dom';
import { useWebfinger } from '@semapps/activitypub-components';
import ListIcon from '@mui/icons-material/List';
import Show from '../../layout/Show';
import Hero from '../../common/list/Hero/Hero';
import ContactCard from '../../common/cards/ContactCard';
import UsernameField from '../../common/fields/UsernameField';
import ContactField from '../../common/fields/ContactField';
import MainList from '../../common/list/MainList/MainList';
import BlockAnonymous from '../../common/BlockAnonymous';
import TagsListEdit from '../../common/tags/TagsListEdit';
import ProfileTitle from '../../resources/Profile/ProfileTitle';

const NetworkActorPage = () => {
  const translate = useTranslate();
  const { webfingerId } = useParams();
  const webfinger = useWebfinger();
  const [actorUri, setActorUri] = useState();

  useEffect(() => {
    webfinger.fetch(webfingerId).then(uri => setActorUri(uri));
  }, [webfinger, webfingerId, setActorUri]);

  if (!actorUri) return null;

  return (
    <BlockAnonymous>
      <Show
        resource="Actor"
        id={actorUri}
        title={
          <ReferenceField source="url" reference="Profile" link={false}>
            <ProfileTitle />
          </ReferenceField>
        }
        actions={[
          <Button component={Link} to="/network" label="ra.action.list">
            <ListIcon />
          </Button>
        ]}
        asides={[<ContactCard />]}
      >
        <Hero image="vcard:photo">
          <ReferenceField
            label={translate('resources.Profile.fields.vcard:given-name')}
            source="url"
            reference="Profile"
            link={false}
          >
            <TextField source="vcard:given-name" />
          </ReferenceField>
          <UsernameField source="id" />
          <ReferenceField
            label={translate('resources.Profile.fields.vcard:note')}
            source="url"
            reference="Profile"
            link={false}
          >
            <TextField source="vcard:note" />
          </ReferenceField>
          <DateField
            source="dc:created"
            locales={CONFIG.DEFAULT_LOCALE}
            options={{ month: 'long', day: 'numeric', year: 'numeric' }}
          />
          <TagsListEdit
            source="id"
            addLabel
            label={translate('app.group.group')}
            relationshipPredicate="vcard:hasMember"
            namePredicate="vcard:label"
            avatarPredicate="vcard:photo"
            tagResource="Group"
            recordIdPredicate="id"
          />
        </Hero>
        <MainList>
          <ContactField source="id" label={translate('app.action.send_message')} />
        </MainList>
      </Show>
    </BlockAnonymous>
  );
};

export default NetworkActorPage;
