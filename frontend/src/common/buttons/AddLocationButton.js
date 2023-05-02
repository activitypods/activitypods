import React, { useState } from 'react';
import { useForm } from 'react-final-form';
import {
  required,
  Button,
  SaveButton,
  TextInput,
  useCreate,
  useNotify,
  useTranslate,
  FormWithRedirect,
  RecordContextProvider,
  useGetIdentity,
} from 'react-admin';
import { Dialog, DialogTitle, DialogContent, DialogActions, makeStyles } from '@material-ui/core';
import IconCancel from '@material-ui/icons/Cancel';
import AddIcon from '@material-ui/icons/Add';
import { extractContext, LocationInput } from '@semapps/geo-components';

const useStyles = makeStyles(theme => ({
  button: {
    marginBottom: theme.spacing(2),
    color: '#FFF',
  },
}));

// https://codesandbox.io/s/react-admin-v3-advanced-recipes-quick-createpreview-voyci
const AddLocationButton = ({ onChange, reference, source }) => {
  const classes = useStyles();
  const { identity } = useGetIdentity();
  const [showDialog, setShowDialog] = useState(false);
  const [create, { loading }] = useCreate(reference);
  const translate = useTranslate();
  const notify = useNotify();
  const form = useForm();

  const handleSubmit = async values => {
    // needed to filter current form values
    const filteredValues = {
      'vcard:given-name': values['vcard:given-name'],
      'vcard:hasAddress': values['vcard:hasAddress'],
      'vcard:note': values['vcard:note'],
    }
    create(
      { payload: { data: filteredValues } },
      {
        onSuccess: ({ data }) => {
          setShowDialog(false);
          // Update the initial form to target the newly created location
          // Updating the ReferenceInput value will force it to reload the available locations
          form.change(source, data.id);
          onChange();
        },
        onFailure: ({ error }) => {
          notify(error.message, 'error');
        }
      }
    );
  };

  if (!identity) return null;

  return (
    <RecordContextProvider value={{}}>
      <Button
        className={classes.button}
        variant="contained"
        onClick={() => setShowDialog(true)}
        label={translate('app.action.add_location')}
        color="primary"
      >
        <AddIcon />
      </Button>
      <Dialog
        fullWidth
        open={showDialog}
        onClose={() => setShowDialog(false)}
      >
        <DialogTitle>{translate('app.action.add_location')}</DialogTitle>
        <FormWithRedirect
          save={handleSubmit}
          initialValues={{ 'vcard:given-name': translate('app.user.location', { surname: identity?.fullName })}}
          render={({ handleSubmitWithRedirect, pristine, saving }) => (
            <>
              <DialogContent>
                <TextInput resource={reference} source="vcard:given-name" fullWidth />
                <LocationInput
                  resource={reference}
                  mapboxConfig={{
                    access_token: process.env.REACT_APP_MAPBOX_ACCESS_TOKEN,
                    types: ['place', 'address'],
                    country: ['fr', 'be', 'ch'],
                  }}
                  source={source}
                  parse={(value) => ({
                    type: 'vcard:Address',
                    'vcard:given-name': value.place_name,
                    'vcard:locality': value.place_type[0] === 'place' ? value.text : extractContext(value.context, 'place'),
                    'vcard:street-address': value.place_type[0] === 'address' ? [value.address, value.text].join(' ') : undefined,
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
                <TextInput
                  resource={reference}
                  source="vcard:note"
                  fullWidth
                  helperText={translate('app.helper.location_comment')}
                />
              </DialogContent>
              <DialogActions>
                <Button
                  label="ra.action.cancel"
                  onClick={() => setShowDialog(false)}
                  disabled={loading}
                >
                  <IconCancel />
                </Button>
                <SaveButton
                  handleSubmitWithRedirect={handleSubmitWithRedirect}
                  pristine={pristine}
                  saving={saving}
                  disabled={loading}
                />
              </DialogActions>
            </>
          )}
        />
      </Dialog>
    </RecordContextProvider>
  );
}

export default AddLocationButton;
