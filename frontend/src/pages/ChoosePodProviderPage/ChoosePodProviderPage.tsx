import React, { useEffect, useState } from 'react';
import { useTranslate } from 'react-admin';
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Button,
  TextField,
  Grid
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import { validateBaseUrl } from '../../utils';
import SimpleBox from '../../layout/SimpleBox';

const fetchRemotePodProviders = async (source: string) => {
  const results = await fetch(source, {
    headers: {
      Accept: 'application/ld+json'
    }
  });
  if (results.ok) {
    const json = await results.json();
    const podProviders = json['ldp:contains'] as string[] | undefined;
    return podProviders || [];
  }
  return [];
};

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
  const [text, setText] = useState('');
  const [hasError, setHasError] = useState(false as false | string);

  /** Validates the text input. */
  const onTextChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const { error } = validateBaseUrl(val, true);
    setHasError(error && translate(error));

    setText(val);
  };

  return (
    <SimpleBox
      title={translate('app.page.choose_custom_provider')}
      text={translate('app.helper.choose_custom_provider')}
    >
      {/* Provider URI Input */}
      <Grid container item display="flex" justifyContent="center">
        <TextField
          fullWidth
          value={text}
          onChange={onTextChanged}
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
          <Button
            variant="contained"
            fullWidth
            type="submit"
            onClick={e => {
              e.preventDefault();
              onSelected(text);
            }}
            disabled={!!hasError}
            color="primary"
          >
            {translate('app.action.select')}
          </Button>
        </Grid>
        {/* Cancel Button */}
        <Grid container item>
          <Button variant="contained" fullWidth type="reset" onClick={onCancel} color="secondary">
            {translate('app.action.go_back')}
          </Button>
        </Grid>
      </Grid>
    </SimpleBox>
  );
};

const localPodProvider = {
  type: 'apods:PodProvider',
  'apods:area': process.env.REACT_APP_POD_PROVIDER_URL,
  'apods:locales': 'en',
  'apods:domainName': process.env.REACT_APP_POD_PROVIDER_URL
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
  const [inCustomProviderSelect, setInCustomProviderSelect] = useState(false);
  const [podProviders, setPodProviders] = useState(customPodProviders || []);

  useEffect(() => {
    fetchRemotePodProviders(process.env.POD_PROVIDERS_URL || 'https://data.activitypods.org/pod-providers').then(
      fetchedProviders => {
        setPodProviders([
          localPodProvider,
          ...fetchedProviders.filter(
            (podProvider: any) => podProvider['apods:domainName'] === localPodProvider['apods:domainName']
          )
        ]);
      }
    );
  }, []);

  return inCustomProviderSelect ? (
    <ChooseCustomPodProvider
      onSelected={onPodProviderSelected}
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
                    onPodProviderSelected(podProvider['apods:domainName'] as string);
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
          {translate('app.action.go_back')}
        </Button>
      </Grid>
    </SimpleBox>
  );
};

export default ChoosePodProviderPage;
