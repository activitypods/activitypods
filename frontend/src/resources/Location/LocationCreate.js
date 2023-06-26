import React from 'react';
import { useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Create from '../../layout/Create';
import LocationForm from './LocationForm';

export const LocationCreate = (props) => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity) return null;
  return (
    <Create {...props}>
      <LocationForm
        initialValues={{ 'vcard:given-name': translate('app.user.location', { surname: identity?.fullName }) }}
      />
    </Create>
  );
};

export default LocationCreate;
