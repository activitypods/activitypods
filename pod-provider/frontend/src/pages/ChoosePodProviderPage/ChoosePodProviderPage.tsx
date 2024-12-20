import React, { useCallback, useEffect, useState } from 'react';
import { useGetList, useNotify, useTranslate, Button } from 'react-admin';
import {
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Box,
  CircularProgress,
  ListItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import { isLocalURL, localPodProviderObject, uniqueBy } from '../../utils';
import SimpleBox from '../../layout/SimpleBox';
import CustomPodProviderScreen from './CustomPodProviderScreen';

interface ChoosePodProviderPageProps {
  text?: string;
  detailsText?: string | React.JSX.Element;
  onPodProviderSelected: (podProviderUrl: string) => void;
  onCancel: () => void;
}

/**
 * Renders the ChoosePodProviderPage component.
 * @param {object} props - The component props.
 * @param {string} props.text - Text to show at the top.
 * @param {string} props.detailsText - Text to show at the bottom.
 * @param {Function} props.onPodProviderSelected - The function called when a pod provider is selected.
 * @param {Function} props.onCancel - The function called when the user cancels the selection.
 * @returns {JSX.Element} The rendered ChoosePodProviderPage component.
 */
const ChoosePodProviderPage = ({
  text = '',
  detailsText = '',
  onPodProviderSelected,
  onCancel
}: ChoosePodProviderPageProps): React.JSX.Element => {
  const translate = useTranslate();
  const notify = useNotify();
  const [inCustomProviderSelect, setInCustomProviderSelect] = useState(false);
  const {
    data: podProvidersRaw,
    error,
    isLoading
  } = useGetList('PodProvider', { filter: { 'apods:locales': CONFIG.DEFAULT_LOCALE } });

  // If we are on a local server, don't allow to select remote Pod providers as it will not work
  const podProviders = isLocalURL(CONFIG.BACKEND_URL)
    ? [localPodProviderObject]
    : uniqueBy(provider => provider['apods:baseUrl'] as string, [localPodProviderObject, ...(podProvidersRaw || [])]);

  const providerSelected = useCallback(
    (baseUrl: string) => {
      onPodProviderSelected(baseUrl);
    },
    [onPodProviderSelected]
  );

  useEffect(() => {
    if (error) {
      notify('app.notification.pod_provider_fetch_error', { messageArgs: { error } });
    }
  }, [error]);

  return inCustomProviderSelect ? (
    <CustomPodProviderScreen
      onSelected={providerSelected}
      onCancel={() => {
        setInCustomProviderSelect(false);
      }}
    />
  ) : (
    <SimpleBox title={translate('app.page.choose_provider')} text={text} infoText={detailsText}>
      {/* Pod Providers List */}
      <List>
        {podProviders.map(podProvider => {
          return (
            <React.Fragment key={podProvider['apods:baseUrl']}>
              <Divider />
              <ListItemButton
                onClick={() => {
                  providerSelected(podProvider['apods:baseUrl'] as string);
                }}
              >
                <ListItemAvatar>
                  <Avatar>
                    <StorageIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={podProvider['apods:baseUrl']} secondary={podProvider['apods:area']} />
              </ListItemButton>
            </React.Fragment>
          );
        })}
        {isLoading && (
          <ListItem sx={{ justifyContent: 'center' }}>
            <CircularProgress />
          </ListItem>
        )}
        {/* Allow to add another Pod provider only if we are on a remote server */}
        {!isLocalURL(CONFIG.BACKEND_URL) && (
          <>
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
          </>
        )}
      </List>
      <Box display="flex" justifyContent="end" sx={{ pt: 2 }}>
        <Button variant="contained" color="grey" onClick={() => onCancel()}>
          {translate('ra.action.back')}
        </Button>
      </Box>
    </SimpleBox>
  );
};

export default ChoosePodProviderPage;
