import React, { useCallback, useState } from 'react';
import { Form, TextInput, useTranslate } from 'react-admin';
import { Button, Grid } from '@mui/material';
import { FieldValues, SubmitHandler } from 'react-hook-form';
import { validateBaseUrl } from '../../utils';
import SimpleBox from '../../layout/SimpleBox';

/**
 * Component for choosing a custom pod provider. Only allows http(s) base URLs (no paths).
 * @param {object} props - Props
 * @param {Function} props.onSelected - A callback function called when a pod provider is selected. It takes a string parameter representing the URI of the selected provider.
 * @param {Function} props.onCancel - A callback function called when the user cancels the selection.
 * @returns {JSX.Element} - The rendered component.
 */
const CustomPodProviderScreen = ({
  onSelected,
  onCancel
}: {
  onSelected: (uri: string) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const formDefaultValues = { podProvider: '' };

  const [hasError, setHasError] = useState('');

  /** Validates the text input. */
  const validateProviderUri = (val: string) => {
    const { error } = validateBaseUrl(val, true);
    setHasError(error || '');
    return error || '';
  };

  const onSubmit: SubmitHandler<FieldValues> = useCallback(
    params => {
      let { podProvider } = params as typeof formDefaultValues;
      onSelected(String(podProvider));
    },
    [onSelected]
  );

  return (
    <SimpleBox
      title={translate('app.page.choose_custom_provider')}
      text={translate('app.helper.choose_custom_provider')}
    >
      <Form defaultValues={formDefaultValues} onSubmit={onSubmit}>
        {/* Provider URI Input */}
        <Grid container item display="flex" justifyContent="center">
          <TextInput
            fullWidth
            source="podProvider"
            validate={validateProviderUri}
            helperText={hasError}
            error={!!hasError}
            autoFocus
            label={translate('app.input.provider_url')}
          />
        </Grid>
        {/* Buttons */}
        <Grid
          container
          item
          display="flex"
          spacing={1}
          justifyContent="center"
          sx={{ flexFlow: 'column', alignItems: 'center' }}
        >
          <Grid container item mt={2}>
            {/* Submit Button */}
            <Button type="submit" variant="contained" fullWidth color="primary">
              {translate('app.action.select')}
            </Button>
          </Grid>
          {/* Cancel Button */}
          <Grid container item>
            <Button variant="contained" fullWidth type="reset" onClick={onCancel} color="secondary">
              {translate('ra.action.back')}
            </Button>
          </Grid>
        </Grid>
      </Form>
    </SimpleBox>
  );
};

export default CustomPodProviderScreen;
