import React from 'react';
import { EditBase, useTranslate } from 'react-admin';
import EditPage from '../../layout/EditPage';
import LocationForm from './LocationForm';

export const LocationEdit = (props) => {
  const translate = useTranslate();
  return (
    <EditBase {...props}>
      <EditPage title={translate('ra.action.edit')}>
        <LocationForm />
      </EditPage>
    </EditBase>
  );
};

export default LocationEdit;
