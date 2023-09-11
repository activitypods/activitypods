import React from 'react';
import { required, SimpleForm, TextInput, useTranslate } from 'react-admin';
import { extractContext, LocationInput } from '@semapps/geo-components';

export const LocationForm = (props) => {
  const translate = useTranslate();
  return (
    <>
      <SimpleForm {...props} redirect="list">
        <TextInput source="vcard:given-name" fullWidth />
        <LocationInput
          mapboxConfig={{
            access_token: process.env.REACT_APP_MAPBOX_ACCESS_TOKEN,
            types: ['place', 'address'],
            country: ['fr', 'be', 'ch'],
          }}
          source="vcard:hasAddress"
          parse={(value) => ({
            type: 'vcard:Address',
            'vcard:given-name': value.place_name,
            'vcard:locality': value.place_type[0] === 'place' ? value.text : extractContext(value.context, 'place'),
            'vcard:street-address':
              value.place_type[0] === 'address' ? [value.address, value.text].join(' ') : undefined,
            'vcard:postal-code': extractContext(value.context, 'postcode'),
            'vcard:country-name': extractContext(value.context, 'country'),
            'vcard:hasGeo': {
              'vcard:longitude': value.center[0],
              'vcard:latitude': value.center[1],
            },
          })}
          optionText={(resource) => resource['vcard:given-name']}
          validate={[required()]}
          fullWidth
        />
        <TextInput source="vcard:note" fullWidth helperText={translate('app.helper.location_comment')} />
      </SimpleForm>
    </>
  );
};

export default LocationForm;
