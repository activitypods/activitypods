import React from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Create from '../../layout/Create';
import LocationForm from './LocationForm';

export const LocationCreate = (props) => {
  const { identity } = useCheckAuthenticated();
  if (!identity) return null;
  return (
    <Create {...props}>
      <LocationForm initialValues={{ 'vcard:given-name': 'Chez ' + identity?.fullName }} />
    </Create>
  );
};

export default LocationCreate;
