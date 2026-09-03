import React, { useEffect, useState } from 'react';
import {
  DateField,
  useTranslate,
  Button,
  ResourceContextProvider,
  EditButton,
  useCreatePath,
  useRecordContext
} from 'react-admin';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useWebfinger } from '@semapps/activitypub-components';
import { Box, Alert, useMediaQuery } from '@mui/material';
import ListIcon from '@mui/icons-material/List';
import EditIcon from '@mui/icons-material/Edit';
import Hero from '../../common/list/Hero/Hero';
import ContactCard from '../../common/cards/ContactCard';
import ContactField from '../../common/fields/ContactField';
import MainList from '../../common/list/MainList/MainList';
import BlockAnonymous from '../../common/BlockAnonymous';
import TagsListEdit from '../../common/tags/TagsListEdit';
import ShowView from '../../layout/ShowView';
import ValueField from '../../common/fields/ValueField';
import useActor from '../../hooks/useActor';

const EditPrivateProfileButton = (props: any) => {
  const record = useRecordContext();
  const createPath = useCreatePath();
  return (
    <Button label="ra.action.edit" href={createPath({ resource: 'Profile', id: record?.url, type: 'edit' })} {...props}>
      <EditIcon />
    </Button>
  );
};

const ProfileWarning = ({ publicProfileOnly }: any) => {
  const translate = useTranslate();
  const location = useLocation();

  return (
    <Box mb={2}>
      <Alert severity="warning">
        {translate(publicProfileOnly ? 'app.helper.public_profile_view' : 'app.helper.private_profile_view')}. &nbsp;
        <Link
          to={publicProfileOnly ? location.pathname : `${location.pathname}?public=true`}
          style={{ color: 'inherit' }}
        >
          {translate(publicProfileOnly ? 'app.action.view_private_profile' : 'app.action.view_public_profile')}
        </Link>
      </Alert>
    </Box>
  );
};

const NetworkActorPage = () => {
  const translate = useTranslate();
  const { webfingerId } = useParams();
  const [searchParams] = useSearchParams();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  const publicProfileOnly = searchParams.has('public');
  const webfinger = useWebfinger();
  const [actorUri, setActorUri] = useState();

  useEffect(() => {
    if (webfingerId?.startsWith('http')) {
      // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
      setActorUri(webfingerId);
    } else {
      webfinger.fetch(webfingerId).then(uri => setActorUri(uri));
    }
  }, [webfinger, webfingerId, setActorUri]);

  const actor = useActor(actorUri, { loadPrivateProfile: !publicProfileOnly });

  if (actor.isLoading) return null;

  return (
    <BlockAnonymous>
      <ResourceContextProvider value="Actor">
        <ShowView
          title={actor.name}
          actions={
            actor.isLoggedUser
              ? [publicProfileOnly ? <EditButton /> : <EditPrivateProfileButton />]
              : [
                  <Button component={Link} to="/network" label="ra.action.list">
                    <ListIcon />
                  </Button>
                ]
          }
          asides={[<ContactCard actor={actor} publicProfileOnly={publicProfileOnly} />]}
        >
          {actor.isLoggedUser && <ProfileWarning publicProfileOnly={publicProfileOnly} />}
          <Hero image={actor.image}>
            <ValueField value={actor.name} label={translate('resources.Profile.fields.vcard:given-name')} />
            <ValueField value={actor.webfinger} label={translate('resources.Actor.fields.preferredUsername')} />
            <ValueField
              value={actor.summary}
              label={translate('resources.Profile.fields.vcard:note')}
              sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mr: 4 }}
            />
            <DateField
              source="dc:created"
              locales={CONFIG.DEFAULT_LOCALE}
              options={{ month: 'long', day: 'numeric', year: 'numeric' }}
            />
            {!actor.isLoggedUser && (
              <TagsListEdit
                source="id"
                addLabel
                label={translate('app.tag.tag')}
                relationshipPredicate="vcard:hasMember"
                namePredicate="vcard:label"
                avatarPredicate="vcard:photo"
                tagResource="Tag"
                recordIdPredicate="id"
              />
            )}
          </Hero>
          {/* <ResourceContextProvider value="Profile">
              <RecordContextProvider value={actor.privateProfile}>
                <MainList>
                  <ReferenceField reference="Location" source="vcard:hasAddress" link={false}>
                    <MapField
                      address={record => (
                        <>
                          {record?.['vcard:given-name'] + ', ' + record?.['vcard:hasAddress']?.['vcard:given-name']}
                          {record?.['vcard:note'] && (
                            <Box mb={2} mt={2}>
                              <Alert severity="info">
                                <strong>{translate('resources.Location.fields.vcard:note')}</strong>:{' '}
                                {record?.['vcard:note']}
                              </Alert>
                            </Box>
                          )}
                        </>
                      )}
                      latitude={record => record?.['vcard:hasAddress']?.['vcard:hasGeo']?.['vcard:latitude']}
                      longitude={record => record?.['vcard:hasAddress']?.['vcard:hasGeo']?.['vcard:longitude']}
                      height={xs ? 250 : 400}
                      typographyProps={{ component: 'div' }}
                    />
                  </ReferenceField>
                </MainList>
              </RecordContextProvider>
            </ResourceContextProvider> */}
          <MainList>
            {!actor.isLoggedUser && <ContactField source="id" label={translate('app.action.send_message')} />}
          </MainList>
        </ShowView>
      </ResourceContextProvider>
    </BlockAnonymous>
  );
};

export default NetworkActorPage;
