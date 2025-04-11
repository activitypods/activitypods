import React from 'react';
import { Admin, Resource, CustomRoutes, localStorageStore } from 'react-admin';
import { BrowserRouter, Route } from 'react-router-dom';
import { QueryClient } from 'react-query';
import { StyledEngineProvider } from '@mui/material/styles';

import authProvider from './config/authProvider';
import dataProvider from './config/dataProvider';
import i18nProvider from './config/i18nProvider';
import * as resources from './resources';

import Layout from './layout/Layout';
import theme from './config/theme';

import HomePage from './pages/HomePage';
import DataPage from './pages/DataPage/DataListPage';
import DataResourcePage from './pages/DataPage/DataShowPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import AdvancedSettingsPage from './pages/SettingsPage/AdvancedSettingsPage';
import SettingsPasswordPage from './pages/SettingsPage/SettingsPasswordPage';
import SettingsEmailPage from './pages/SettingsPage/SettingsEmailPage';
import SettingsExportPage from './pages/SettingsPage/SettingsExportPage';
import SettingsDeletePage from './pages/SettingsPage/SettingsDeletePage';
import ProfileCreatePage from './pages/ProfileCreatePage/ProfileCreatePage';
import AuthorizePage from './pages/AuthorizePage/AuthorizePage';
import UserPage from './pages/UserPage';
import RedirectPage from './pages/RedirectPage';
import InvitePage from './pages/InvitePage/InvitePage';
import ApplicationsPage from './pages/ApplicationsPage/ApplicationsPage';
import LoginPage from './pages/LoginPage';
import NetworkPage from './pages/NetworkPage/NetworkPage';
import NetworkActorPage from './pages/NetworkPage/NetworkActorPage';
import NetworkRequestPage from './pages/NetworkPage/NetworkRequestPage';
import SettingsLocalePage from './pages/SettingsPage/SettingsLocalePage';
import SettingsProfilesPage from './pages/SettingsPage/ProfilesPage/SettingsProfilesPage';
import CreateGroupPage from './pages/CreateGroupPage';
import GroupSettingsPage from './pages/SettingsPage/GroupSettingsPage';
import PublicProfilePage from './pages/SettingsPage/ProfilesPage/PublicProfilePage';
import PrivateProfilePage from './pages/SettingsPage/ProfilesPage/PrivateProfilePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // staleTime: 5 * 60 * 1000, // Considering data fresh for 5 minutes, might cause caching-related hard to find bugs..
      cacheTime: 30 * 60 * 1000, // Cache unused data for 30 minutes.
      retry: 3
    }
  }
});

const App = () => (
  <StyledEngineProvider injectFirst>
    <BrowserRouter>
      <Admin
        title={CONFIG.INSTANCE_NAME}
        // @ts-expect-error TS(2322): Type '{ login: (params: any) => Promise<void>; han... Remove this comment to see the full error message
        authProvider={authProvider}
        dataProvider={dataProvider}
        i18nProvider={i18nProvider}
        loginPage={LoginPage}
        layout={Layout}
        theme={theme}
        store={localStorageStore()}
        queryClient={queryClient}
        disableTelemetry
      >
        {Object.entries(resources).map(([key, resource]) => (
          // @ts-expect-error TS(2339): Property 'config' does not exist on type '{ dataMo... Remove this comment to see the full error message
          <Resource key={key} name={key} {...resource.config} />
        ))}
        <CustomRoutes noLayout>
          <Route path="/" element={<HomePage />} />
          <Route path="/u/:id" element={<UserPage />} />
          <Route path="/r" element={<RedirectPage />} />
          <Route path="/initialize" element={<ProfileCreatePage />} />
          <Route path="/authorize" element={<AuthorizePage />} />
          <Route path="/invite/:capability" element={<InvitePage />} />
          <Route path="/groups">
            <Route path="create" element={<CreateGroupPage />} />
          </Route>
        </CustomRoutes>
        <CustomRoutes>
          <Route path="/network">
            <Route index element={<NetworkPage />} />
            <Route path="request" element={<NetworkRequestPage />} />
            <Route path=":webfingerId" element={<NetworkActorPage />} />
          </Route>
          <Route path="/apps" element={<ApplicationsPage />} />
          <Route path="/data">
            <Route index element={<DataPage />} />
            <Route path=":resourceUri" element={<DataResourcePage />} />
          </Route>
          <Route path="/settings">
            <Route index element={<SettingsPage />} />
            <Route path="profiles">
              <Route index element={<SettingsProfilesPage />} />
              <Route path="public" element={<PublicProfilePage />} />
              <Route path="private" element={<PrivateProfilePage />} />
            </Route>
            <Route path="email" element={<SettingsEmailPage />} />
            <Route path="password" element={<SettingsPasswordPage />} />
            <Route path="locale" element={<SettingsLocalePage />} />
            <Route path="advanced" element={<AdvancedSettingsPage />} />
            <Route path="export" element={<SettingsExportPage />} />
            <Route path="delete" element={<SettingsDeletePage />} />
          </Route>
          <Route path="/group/:groupId">
            <Route path="settings">
              <Route index element={<GroupSettingsPage />} />
              <Route path="profile" element={<PublicProfilePage />} />
              <Route path="export" element={<SettingsExportPage />} />
              <Route path="delete" element={<SettingsDeletePage />} />
            </Route>
          </Route>
        </CustomRoutes>
      </Admin>
    </BrowserRouter>
  </StyledEngineProvider>
);

export default App;
