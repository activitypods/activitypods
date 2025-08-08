import React, { useCallback, useState } from 'react';
import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import {
  Form,
  useTranslate,
  TextInput,
  ImageInput,
  ImageField,
  Button,
  SelectInput,
  SaveButton,
  useDataProvider,
  useGetIdentity,
  useNotify
} from 'react-admin';
import ChoosePodProviderPage from './ChoosePodProviderPage/ChoosePodProviderPage';
import { useNavigate } from 'react-router-dom';
import SimpleBox from '../layout/SimpleBox';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import { Box } from '@mui/material';
import Header from '../common/Header';

const CreateGroupPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { data: identity } = useGetIdentity();
  const [podProviderUrl, setPodProviderUrl] = useState();

  const onSubmit = useCallback(
    async ({ id, type, name, image }: any) => {
      try {
        // TODO Find the group create endpoint by fetching the /.well-known/solid endpoint of the Pod provider

        // Create the group with the id and type
        // @ts-expect-error TS(2345): Argument of type 'undefined' is not assignable to ... Remove this comment to see the full error message
        const createGroupResponse = await dataProvider.fetch(urlJoin(podProviderUrl, '.account/groups'), {
          method: 'POST',
          body: JSON.stringify({ id, type }),
          headers: new Headers({ 'Content-Type': 'application/json' })
        });

        const groupWebId = createGroupResponse.headers.get('Location');

        // Claim the group with the user webId
        await dataProvider.fetch(
          // @ts-expect-error TS(2345): Argument of type 'undefined' is not assignable to ... Remove this comment to see the full error message
          urlJoin(podProviderUrl, '.account', identity.webIdData.preferredUsername, 'claimGroup'),
          {
            method: 'POST',
            body: JSON.stringify({ groupWebId }),
            headers: new Headers({ 'Content-Type': 'application/json' })
          }
        );

        // Upload the logo and get the URL
        // TODO find the upload containers based on a `podStorage` metadata and the DataRegistry
        // const uploadImageResponse = await dataProvider.fetch(urlJoin(groupWebId, 'data', 'semapps', 'file'), {
        //   method: 'POST',
        //   body: image,
        //   headers: new Headers({
        //     'Content-Type': image.type
        //   })
        // });

        // if (!uploadImageResponse.ok) {
        //   notify(`Could not upload image`, { type: 'error' });
        //   return;
        // }

        // const imageUri = uploadImageResponse.headers.get('Location');

        if (name) {
          // Update the group profile (name and logo URL)
          await dataProvider.patch('Actor', {
            id: groupWebId,
            triplesToAdd: [
              rdf.triple(rdf.namedNode(groupWebId), rdf.namedNode('http://xmlns.com/foaf/0.1/name'), rdf.literal(name)),
              rdf.triple(
                rdf.namedNode(groupWebId),
                rdf.namedNode('https://www.w3.org/ns/activitystreams#name'),
                rdf.literal(name)
              )
              // rdf.triple(rdf.namedNode(groupWebId), rdf.namedNode('http://xmlns.com/foaf/0.1/depiction'), rdf.namedNode(imageUri))
            ]
          });
        }

        notify(`Group successfully created`, { type: 'success' });

        // @ts-expect-error TS(2345): Argument of type 'undefined' is not assignable to ... Remove this comment to see the full error message
        navigate(`/group/@${id}@${new URL(podProviderUrl).host}/settings`);
      } catch (e) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        notify(`Could not create group. Error: ${e.message}`, { type: 'error' });
      }
    },
    [podProviderUrl, identity, notify, dataProvider, navigate]
  );

  return !podProviderUrl ? (
    <>
      <Header title="app.titles.create_group" />
      <ChoosePodProviderPage
        text={translate('app.helper.create_group')}
        // @ts-expect-error TS(2322): Type 'Dispatch<SetStateAction<undefined>>' is not ... Remove this comment to see the full error message
        onPodProviderSelected={setPodProviderUrl}
        onCancel={() => navigate('/')}
      />
    </>
  ) : (
    <>
      <Header title="app.titles.create_group" />
      <SimpleBox title={translate('app.action.create_group')} icon={<GroupAddIcon />}>
        <Form onSubmit={onSubmit} defaultValues={{ type: 'foaf:Group' }}>
          <TextInput source="id" label={translate('app.group.id')} fullWidth />
          <SelectInput
            source="type"
            label={translate('app.group.type')}
            choices={[
              { id: 'foaf:Group', name: translate('app.group.type_group') },
              { id: 'foaf:Organization', name: translate('app.group.type_organization') }
            ]}
            fullWidth
          />
          <TextInput source="name" label={translate('app.group.name')} fullWidth />
          {/* <ImageInput source="image" label={translate('app.group.image')} accept="image/*">
            <ImageField source="src" />
          </ImageInput> */}
          <Box display="flex" justifyContent="end" sx={{ pt: 2 }}>
            <>{/* @ts-ignore */}</>
            <Button
              variant="outlined"
              // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
              onClick={() => setPodProviderUrl()}
            >
              <>{/* @ts-ignore */}</>
              {translate('ra.action.back')}
            </Button>
            <SaveButton sx={{ ml: 1 }} />
          </Box>
        </Form>
      </SimpleBox>
    </>
  );
};

export default CreateGroupPage;
