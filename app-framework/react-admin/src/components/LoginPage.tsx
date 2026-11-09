import React, { FunctionComponent, Fragment, useEffect, useState } from 'react';
import jwtDecode from 'jwt-decode';
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
import type { PodProvider, SolidOIDCToken } from '../types';
import useRegisterApp from '../hooks/useRegisterApp';
import { isPath } from '../utils';

/**
 * Display a list of Pod providers that we can log in
 * This list is taken from the https://activitypods.org/data/pod-providers endpoint
 * It is possible to replace it with a custom list of Pod providers
 */
const LoginPage: FunctionComponent<Props> = ({ text, clientId, customPodProviders }) => {
  const notify = useNotify();
  const [searchParams] = useSearchParams();
  const [locale] = useLocaleState();
  const login = useLogin();
  const logout = useLogout();
  const translate = useTranslate();
  const redirect = useRedirect();
  const { data: identity, isLoading: isIdentityLoading } = useGetIdentity();
  const [podProviders, setPodProviders] = useState<[PodProvider]>(customPodProviders || []);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const isSignup = searchParams.has('signup');
  const redirectUrl = isPath(searchParams.get('redirect')) ? searchParams.get('redirect')! : '/';
  const registerApp = useRegisterApp();

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

  useEffect(() => {
    if (searchParams.has('iss')) {
      // Automatically login if Pod provider is known
      login({ issuer: searchParams.get('iss'), redirect: redirectUrl });
    } else if (searchParams.has('register_app')) {
      // Identity is not available yet because we can't fetch the user profile
      // So get the webId by decoding the token
      const token = localStorage.getItem('token');
      if (token) {
        const payload = jwtDecode(token) as SolidOIDCToken;
        registerApp(clientId, payload?.webid)
          .then(appRegistrationUri => {
            if (appRegistrationUri) setIsRegistered(true);
          })
          .catch(error => {
            notify(error.message, { type: 'error' });
          });
      }
    } else if (searchParams.has('logout')) {
      // Immediately logout if required
      logout({ redirectUrl });
    }
  }, [searchParams, login, registerApp, clientId, setIsRegistered, notify, logout, redirectUrl]);

  useEffect(() => {
    if (!isIdentityLoading && identity?.id && isRegistered) {
      redirect(redirectUrl);
    }
  }, [identity, isIdentityLoading, isRegistered, redirect, redirectUrl]);

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
                        redirect: redirectUrl,
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
  clientId: string;
  customPodProviders: [PodProvider];
};

export default LoginPage;
