import React from 'react';
import { Admin, Resource, CustomRoutes, memoryStore } from 'react-admin';
import { BrowserRouter, Route } from 'react-router-dom';
import { StyledEngineProvider } from '@mui/material/styles';
import { LocalLoginPage } from '@semapps/auth-provider';

import authProvider from './config/authProvider';
import dataProvider from './config/dataProvider';
import i18nProvider from './config/i18nProvider';
import * as resources from './resources';

import Layout from './layout/Layout';
import theme from './config/theme';

import HomePage from './pages/HomePage';
// import SettingsPage from "./pages/SettingsPage/SettingsPage";
// import SettingsPasswordPage from "./pages/SettingsPage/SettingsPasswordPage";
// import SettingsEmailPage from "./pages/SettingsPage/SettingsEmailPage";
// import ProfileCreatePage from "./pages/ProfileCreatePage/ProfileCreatePage";
// import AuthorizePage from "./pages/AuthorizePage/AuthorizePage";
// import UserPage from "./pages/UserPage";
// import RedirectPage from "./pages/RedirectPage";

const App = () => (
  <StyledEngineProvider injectFirst>
  <BrowserRouter>
    <Admin
      title={process.env.REACT_APP_NAME}
      authProvider={authProvider}
      dataProvider={dataProvider}
      i18nProvider={i18nProvider}
      loginPage={LocalLoginPage}
      layout={Layout}
      theme={theme}
      store={memoryStore()}
    >
      {Object.entries(resources).map(([key, resource]) => (
        <Resource key={key} name={key} {...resource.config} />
      ))}
      <CustomRoutes noLayout>
        <Route exact path="/" element={<HomePage />} />
        {/* <Route exact path="/u/:id" element={<UserPage />} />
        <Route exact path="/r" element={<RedirectPage />} />
        <Route exact path="/initialize" element={<ProfileCreatePage />} />
        <Route exact path="/authorize" element={<AuthorizePage />} /> */}
      </CustomRoutes>
      <CustomRoutes>
        {/* <Route exact path="/settings" element={<SettingsPage />} />
        <Route exact path="/settings/email" element={<SettingsEmailPage />} />
        <Route exact path="/settings/password" element={<SettingsPasswordPage />} /> */}
      </CustomRoutes>
    </Admin>
  </BrowserRouter>
  </StyledEngineProvider>
);

export default App;
