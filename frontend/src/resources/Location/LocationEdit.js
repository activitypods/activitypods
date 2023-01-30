import React from 'react';
import { ListButton } from "react-admin";
import Edit from '../../layout/Edit';
import LocationForm from './LocationForm';
import LocationTitle from "./LocationTitle";

export const LocationEdit = (props) => (
  <Edit title={<LocationTitle />} actions={[<ListButton />]} {...props}>
    <LocationForm />
  </Edit>
);

export default LocationEdit;
