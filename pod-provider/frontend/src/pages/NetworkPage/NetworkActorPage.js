import React, { useEffect, useState } from 'react';
import {
  DateField,
  useTranslate,
  Button,
  useGetOne,
  RecordContextProvider,
  ResourceContextProvider
} from 'react-admin';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useWebfinger } from '@semapps/activitypub-components';
import ListIcon from '@mui/icons-material/List';
import Hero from '../../common/list/Hero/Hero';
import ContactCard from '../../common/cards/ContactCard';
import UsernameField from '../../common/fields/UsernameField';
import ContactField from '../../common/fields/ContactField';
import MainList from '../../common/list/MainList/MainList';
import BlockAnonymous from '../../common/BlockAnonymous';
import TagsListEdit from '../../common/tags/TagsListEdit';
import ShowView from '../../layout/ShowView';
import ValueField from '../../common/fields/ValueField';
import { stripHtmlTags } from '../../utils';

const NetworkActorPage = () => {
  const translate = useTranslate();
  const { webfingerId } = useParams();
  const [searchParams] = useSearchParams();
  const webfinger = useWebfinger();
  const [actorUri, setActorUri] = useState();

  useEffect(() => {
    if (webfingerId?.startsWith('http')) {
      setActorUri(webfingerId);
    } else {
      webfinger.fetch(webfingerId).then(uri => setActorUri(uri));
    }
  }, [webfinger, webfingerId, setActorUri]);

  const { data: actor } = useGetOne('Actor', { id: actorUri }, { enabled: !!actorUri });

  console.log('searchParams', searchParams.has('public'), !searchParams.has('public') && !!actor?.url);

  const { data: profile } = useGetOne(
    'Profile',
    { id: actor?.url },
    { enabled: !!searchParams.has('public') && !!actor?.url }
  );

  console.log('profile', profile);

  if (!actor) return null;

  return (
    <BlockAnonymous>
      <ResourceContextProvider value="Actor">
        <RecordContextProvider value={actor}>
          <ShowView
            title={profile?.['vcard:given-name'] || actor.name || actor.preferredUsername}
            actions={[
              <Button component={Link} to="/network" label="ra.action.list">
                <ListIcon />
              </Button>
            ]}
            asides={[<ContactCard actor={actor} profile={profile} />]}
          >
            <Hero image={profile?.['vcard:photo'] || actor.icon?.url}>
              <ValueField
                value={profile?.['vcard:given-name'] || actor.name || actor.preferredUsername}
                label={translate('resources.Profile.fields.vcard:given-name')}
              />
              <UsernameField source="id" />
              <ValueField
                value={profile?.['vcard:note'] || stripHtmlTags(actor.summary)}
                label={translate('resources.Profile.fields.vcard:note')}
                sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mr: 4 }}
              />
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
          </ShowView>
        </RecordContextProvider>
      </ResourceContextProvider>
    </BlockAnonymous>
  );
};

export default NetworkActorPage;
