import React, { useState } from 'react';
import {
  required,
  SaveButton,
  TextInput,
  useCreate,
  useNotify,
  useTranslate,
  Form,
  ResourceContextProvider,
  RecordContextProvider,
  useGetIdentity,
  useGetList
} from 'react-admin';
import { useFormContext } from 'react-hook-form';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import IconCancel from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import { extractContext, LocationInput } from '@semapps/geo-components';

const useStyles = makeStyles(theme => ({
  button: {
    margin: '12px 0 0 12px',
    [theme.breakpoints.down('sm')]: {
      margin: '-12px 0 12px 0'
    }
  }
}));

// https://codesandbox.io/s/react-admin-v3-advanced-recipes-quick-createpreview-voyci
const AddLocationButton = ({ reference, source, onChange }) => {
  const form = useFormContext();
  const classes = useStyles();
  const { data: identity } = useGetIdentity();
  const [showDialog, setShowDialog] = useState(false);
  const [create, { isLoading }] = useCreate();
  const { data: existingLocations } = useGetList(reference);
  const translate = useTranslate();
  const notify = useNotify();

  const handleSubmit = async values => {
    // needed to filter current form values
    const filteredValues = {
      'vcard:given-name': values['vcard:given-name'],
      'vcard:hasAddress': values['vcard:hasAddress'],
      'vcard:note': values['vcard:note']
    };
    create(
      reference,
      { data: filteredValues },
      {
        onSuccess: data => {
          setShowDialog(false);
          // Update the initial input to target the newly created location
          // Set shouldDirty to true to activate the save button
          // See https://react-hook-form.com/docs/useform/setvalue
          form.setValue(source, data.id, { shouldDirty: true });
          onChange();
        },
        onError: error => {
          notify(error.message, { type: 'error' });
        }
      }
    );
  };

  if (!identity) return null;

  return (
    <ResourceContextProvider value={reference}>
      <RecordContextProvider value={{}}>
        <Button
          className={classes.button}
          variant="contained"
          onClick={() => setShowDialog(true)}
          color="primary"
          startIcon={<AddIcon />}
        >
          {translate('app.action.add_location')}
        </Button>
        <Dialog fullWidth open={showDialog} onClose={() => setShowDialog(false)}>
          <DialogTitle>{translate('app.action.add_location')}</DialogTitle>
          <Form
            onSubmit={handleSubmit}
            defaultValues={
              existingLocations?.length === 0
                ? { 'vcard:given-name': translate('app.user.location', { name: identity?.fullName }) }
                : undefined
            }
          >
            <DialogContent>
              <TextInput resource="Location" source="vcard:given-name" fullWidth />
              <LocationInput
                mapboxConfig={{
                  access_token: CONFIG.MAPBOX_ACCESS_TOKEN,
                  types: ['place', 'address'],
                  country: ['fr', 'be', 'ch']
                }}
                source="vcard:hasAddress"
                parse={value => ({
                  type: 'vcard:Address',
                  'vcard:given-name': value.place_name,
                  'vcard:locality':
                    value.place_type[0] === 'place' ? value.text : extractContext(value.context, 'place'),
                  'vcard:street-address':
                    value.place_type[0] === 'address' ? [value.address, value.text].join(' ') : undefined,
                  'vcard:postal-code': extractContext(value.context, 'postcode'),
                  'vcard:country-name': extractContext(value.context, 'country'),
                  'vcard:hasGeo': {
                    'vcard:longitude': value.center[0],
                    'vcard:latitude': value.center[1]
                  }
                })}
                optionText={resource => resource['vcard:given-name']}
                validate={[required()]}
                fullWidth
                variant="filled"
              />
              <TextInput
                resource="Location"
                source="vcard:note"
                fullWidth
                helperText={translate('app.helper.location_comment')}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setShowDialog(false)}
                disabled={isLoading}
                startIcon={<IconCancel />}
                color="black"
              >
                {translate('ra.action.cancel')}
              </Button>
              <SaveButton disabled={isLoading} />
            </DialogActions>
          </Form>
        </Dialog>
      </RecordContextProvider>
    </ResourceContextProvider>
  );
};

export default AddLocationButton;
