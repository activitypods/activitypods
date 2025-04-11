import React from 'react';
import { useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Create from '../../layout/Create';
import LocationForm from './LocationForm';

export const LocationCreate = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity) return null;
  return (
    <Create>
      <LocationForm
        defaultValues={{ 'vcard:given-name': translate('app.user.location', { name: identity?.fullName }) }}
      />
    </Create>
  );
};

export default LocationCreate;
