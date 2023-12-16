import React, { useCallback, useEffect, useState } from 'react';
import { Form, TextInput, useGetList, useNotify, useTranslate } from 'react-admin';
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Button,
  Grid,
  CircularProgress,
  ListItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import { FieldValues, SubmitHandler } from 'react-hook-form';
import { localPodProviderObject, localhostRegex, uniqueBy, validateBaseUrl } from '../../utils';
import SimpleBox from '../../layout/SimpleBox';

/**
 * Component for choosing a custom pod provider. Only allows http(s) base URLs (no paths).
 * @param {object} props - Props
 * @param {Function} props.onSelected - A callback function called when a pod provider is selected. It takes a string parameter representing the URI of the selected provider.
 * @param {Function} props.onCancel - A callback function called when the user cancels the selection.
 * @returns {JSX.Element} - The rendered component.
 */
const ChooseCustomPodProvider = ({
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
    const { error, url } = validateBaseUrl(val, true);
    setHasError(error || '');
    return error || '';
  };

  const onSubmit: SubmitHandler<FieldValues> = useCallback(
    params => {
      let { podProvider } = params as typeof formDefaultValues;
      // Add https, if no protocol is given.
      if (!/^https?:\/\//.exec(podProvider)) {
        podProvider = `https://${podProvider}`;
      }
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

/**
 *
 * Renders the ChoosePodProviderPage component.
 * @param {object} props - The component props.
 * @param {string} props.detailsText - The details text.
 * @param {Array<object>} props.customPodProviders - The array of custom pod providers.
 * @param {Function} props.onPodProviderSelected - The function called when a pod provider is selected.
 * @param {Function} props.onCancel - The function called when the user cancels the selection.
 * @returns {JSX.Element} The rendered ChoosePodProviderPage component.
 */
const ChoosePodProviderPage = ({
  detailsText = '',
  customPodProviders = [],
  onPodProviderSelected,
  onCancel
}: {
  detailsText: string | React.JSX.Element | undefined;
  customPodProviders: any[] | undefined;
  onPodProviderSelected: (podProviderUrl: string) => void;
  onCancel: () => void;
}): React.JSX.Element => {
  const translate = useTranslate();
  const notify = useNotify();
  const [inCustomProviderSelect, setInCustomProviderSelect] = useState(false);
  const { data: podProvidersRaw, error, isLoading } = useGetList('PodProvider');
  const podProviders = uniqueBy(
    provider => provider['apods:domainName'] as string,
    [localPodProviderObject, ...customPodProviders, ...(podProvidersRaw || [])]
  );

  const providerSelected = useCallback(
    (domainName: string) => {
      onPodProviderSelected(localhostRegex.test(domainName) ? `http://${domainName}` : `https://${domainName}`);
    },
    [onPodProviderSelected]
  );

  useEffect(() => {
    if (error) {
      notify('app.notification.pod_provider_fetch_error', { error });
    }
  }, [error]);

  return inCustomProviderSelect ? (
    <ChooseCustomPodProvider
      onSelected={providerSelected}
      onCancel={() => {
        setInCustomProviderSelect(false);
      }}
    />
  ) : (
    <SimpleBox title={translate('app.page.choose_provider')} infoText={detailsText}>
      {/* Pod Providers List */}
      <Grid item m={2}>
        <List>
          {podProviders.map(podProvider => {
            return (
              <React.Fragment key={podProvider['apods:domainName']}>
                <Divider />
                <ListItemButton
                  onClick={() => {
                    providerSelected(podProvider['apods:domainName'] as string);
                  }}
                >
                  <ListItemAvatar>
                    <Avatar>
                      <StorageIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={podProvider['apods:domainName']} secondary={podProvider['apods:area']} />
                </ListItemButton>
              </React.Fragment>
            );
          })}
          {isLoading && (
            <ListItem sx={{ justifyContent: 'center' }}>
              <CircularProgress />
            </ListItem>
          )}
          {/* Option to add another Pod Provider */}
          <Divider />
          <ListItemButton
            onClick={() => {
              setInCustomProviderSelect(true);
            }}
          >
            <ListItemAvatar>
              <Avatar>
                <AddIcon />
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={translate('app.page.choose_custom_provider')} />
          </ListItemButton>
        </List>
      </Grid>

      {/* Go Back Button */}
      <Grid item alignSelf="center">
        <Button
          variant="contained"
          color="secondary"
          fullWidth
          onClick={() => {
            onCancel();
          }}
        >
          {translate('ra.action.back')}
        </Button>
      </Grid>
    </SimpleBox>
  );
};

export default ChoosePodProviderPage;
