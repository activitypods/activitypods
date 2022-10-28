import React from 'react';
import { CreateBase, useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import CreatePage from '../../layout/CreatePage';
import LocationForm from './LocationForm';

export const LocationCreate = (props) => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity) return null;

  return (
    <CreateBase {...props}>
      <CreatePage title={translate('app.action.add')}>
        <LocationForm initialValues={{ 'vcard:given-name': 'Chez ' + identity?.fullName }} />
      </CreatePage>
    </CreateBase>
  );
};

export default LocationCreate;
