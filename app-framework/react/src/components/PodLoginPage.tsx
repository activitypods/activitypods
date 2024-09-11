import React, { FunctionComponent, Fragment, useEffect, useState } from 'react';
import { useNotify, useLocaleState, useTranslate, useLogin, useLogout, useGetIdentity, useRedirect } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Card,
  Typography
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import StorageIcon from '@mui/icons-material/Storage';
import type { PodProvider } from '../types';

/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */
const PodLoginPageView: FunctionComponent<Props> = ({ text, customPodProviders }) => {
  const notify = useNotify();
  const [searchParams] = useSearchParams();
  const [locale] = useLocaleState();
  const login = useLogin();
  const logout = useLogout();
  const translate = useTranslate();
  const redirect = useRedirect();
  const { data: identity, isLoading: isIdentityLoading } = useGetIdentity();
  const [podProviders, setPodProviders] = useState<[PodProvider]>(customPodProviders || []);
  const isSignup = searchParams.has('signup');
  const redirectUrl = searchParams.get('redirect');

  useEffect(() => {
    (async () => {
      if (podProviders.length < 1) {
        const results = await fetch('https://activitypods.org/data/pod-providers', {
          headers: {
            Accept: 'application/ld+json'
          }
        });
        if (results.ok) {
          const json = await results.json();
          // Filter POD providers by available locales
          const podProviders = json['ldp:contains'].filter((provider: PodProvider) =>
            Array.isArray(provider['apods:locales'])
              ? provider['apods:locales'].includes(locale)
              : provider['apods:locales'] === locale
          );
          setPodProviders(podProviders);
        } else {
          notify('auth.message.pod_providers_not_loaded', { type: 'error' });
        }
      }
    })();
  }, [podProviders, setPodProviders, notify, locale]);

  // Immediately logout if required
  useEffect(() => {
    if (searchParams.has('logout')) {
      logout({ redirectUrl });
    }
  }, [searchParams, logout, redirectUrl]);

  useEffect(() => {
    if (!isIdentityLoading) {
      if (identity?.id) {
        redirect('/');
      } else if (searchParams.has('iss')) {
        // Automatically login if Pod provider is known
        login({ issuer: searchParams.get('iss') });
      }
    }
  }, [searchParams, login, identity, isIdentityLoading, redirect]);

  if (isIdentityLoading) return null;

  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      <Card
        sx={{
          minWidth: 300,
          maxWidth: 350,
          marginTop: '6em'
        }}
      >
        <Box
          sx={{
            margin: '1em',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <Avatar>
            <LockIcon />
          </Avatar>
        </Box>
        <Box pl={2} pr={2}>
          <Typography
            variant="body2"
            sx={{
              textAlign: 'center',
              padding: '4px 8px 8px'
            }}
          >
            {text || translate('auth.message.choose_pod_provider')}
          </Typography>
        </Box>
        <Box m={2}>
          <List sx={{ paddingTop: 0, paddingBottom: 0 }}>
            {podProviders.map((podProvider, i) => (
              <Fragment key={i}>
                <Divider />
                <ListItem>
                  <ListItemButton
                    onClick={() =>
                      login({
                        issuer: podProvider['apods:baseUrl'],
                        redirect: redirectUrl || undefined,
                        isSignup
                      })
                    }
                  >
                    <ListItemAvatar>
                      <Avatar>
                        <StorageIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={new URL(podProvider['apods:baseUrl']).host}
                      secondary={podProvider['apods:area']}
                    />
                  </ListItemButton>
                </ListItem>
              </Fragment>
            ))}
          </List>
        </Box>
      </Card>
    </Box>
  );
};

type Props = {
  text?: string;
  customPodProviders: [PodProvider];
};

export default PodLoginPageView;
