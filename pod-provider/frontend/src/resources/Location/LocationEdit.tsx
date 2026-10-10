import React from 'react';
import { ListButton } from 'react-admin';
import Edit from '../../layout/Edit';
import LocationForm from './LocationForm';
import BlockAnonymous from '../../common/BlockAnonymous';

export const LocationEdit = () => (
  <BlockAnonymous>
    <Edit actions={[<ListButton />]}>
      <LocationForm />
    </Edit>
  </BlockAnonymous>
);

export default LocationEdit;
