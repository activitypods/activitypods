import React from 'react';
import { required, SimpleForm, TextInput, useTranslate } from 'react-admin';
import { extractContext, LocationInput } from '@semapps/geo-components';

export const LocationForm = ({ defaultValues }: any) => {
  const translate = useTranslate();
  return (
    // @ts-expect-error TS(2322): Type '{ children: Element[]; redirect: string; def... Remove this comment to see the full error message
    <SimpleForm redirect="list" defaultValues={defaultValues}>
      <TextInput source="vcard:given-name" fullWidth />
      <> {/* @ts-expect-error TS(2345): Argument of type '"upgrade"' ...*/}</>
      <LocationInput
        mapboxConfig={{
          access_token: CONFIG.MAPBOX_ACCESS_TOKEN,
          types: ['place', 'address'],
          country: ['fr', 'be', 'ch']
        }}
        source="vcard:hasAddress"
        parse={(value: any) => ({
          type: 'vcard:Address',
          'vcard:given-name': value.place_name,
          'vcard:locality': value.place_type[0] === 'place' ? value.text : extractContext(value.context, 'place'),
          'vcard:street-address': value.place_type[0] === 'address' ? [value.address, value.text].join(' ') : undefined,
          'vcard:postal-code': extractContext(value.context, 'postcode'),
          'vcard:country-name': extractContext(value.context, 'country'),

          'vcard:hasGeo': {
            'vcard:longitude': value.center[0],
            'vcard:latitude': value.center[1]
          }
        })}
        optionText={(resource: any) => resource['vcard:given-name']}
        validate={[required()]}
        fullWidth
        variant="filled"
      />
      <TextInput source="vcard:note" fullWidth helperText={translate('app.helper.location_comment')} />
    </SimpleForm>
  );
};

export default LocationForm;
