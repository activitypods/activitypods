import React, { useCallback, useState } from 'react';
import urlJoin from 'url-join';
import { triple, namedNode, literal } from '@rdfjs/data-model';
import {
  Form,
  useTranslate,
  TextInput,
  ImageInput,
  ImageField,
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

const CreateGroupPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { data: identity } = useGetIdentity();
  const [podProviderUrl, setPodProviderUrl] = useState();

  const onSubmit = useCallback(
    async ({ id, type, name, image }) => {
      try {
        // TODO Find the group create endpoint by fetching the /.well-known/solid endpoint of the Pod provider

        // Create the group with the id and type
        const createGroupResponse = await dataProvider.fetch(urlJoin(podProviderUrl, '.account/groups'), {
          method: 'POST',
          body: JSON.stringify({ id, type }),
          headers: new Headers({ 'Content-Type': 'application/json' })
        });

        const groupWebId = createGroupResponse.headers.get('Location');

        // Claim the group with the user webId
        const claimGroupResponse = await dataProvider.fetch(
          urlJoin(podProviderUrl, '.account', encodeURIComponent(identity?.id), 'claimGroup'),
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
              triple(namedNode(groupWebId), namedNode('http://xmlns.com/foaf/0.1/name'), literal(name))
              // triple(namedNode(groupWebId), namedNode('http://xmlns.com/foaf/0.1/depiction'), namedNode(imageUri))
            ]
          });
        }
      } catch (e) {
        notify(`Could not create group. Error: ${e.message}`, { type: 'error' });
      }
    },
    [podProviderUrl, identity, notify, dataProvider]
  );

  return !podProviderUrl ? (
    <ChoosePodProviderPage
      text={translate('app.helper.create_group')}
      onPodProviderSelected={setPodProviderUrl}
      onCancel={() => navigate('/')}
    />
  ) : (
    <SimpleBox title={translate('app.action.create_group')} icon={<GroupAddIcon />}>
      <Form onSubmit={onSubmit}>
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
        <ImageInput source="image" label={translate('app.group.image')} accept="image/*">
          <ImageField source="src" />
        </ImageInput>
        <SaveButton />
      </Form>
    </SimpleBox>
  );
};

export default CreateGroupPage;
