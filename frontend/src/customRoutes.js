import React from 'react';
import { RouteWithoutLayout } from 'react-admin';
import { Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import SettingsPasswordPage from './pages/SettingsPage/SettingsPasswordPage';
import SettingsEmailPage from './pages/SettingsPage/SettingsEmailPage';
import ProfileCreatePage from './pages/ProfileCreatePage/ProfileCreatePage';
import AuthorizePage from './pages/AuthorizePage/AuthorizePage';
import UserPage from './pages/UserPage';
import RedirectPage from './pages/RedirectPage';

export default [
  <RouteWithoutLayout exact path="/" component={HomePage} />,
  <RouteWithoutLayout exact path="/u/:id" component={UserPage} />,
  <RouteWithoutLayout exact path="/r" component={RedirectPage} />,
  <RouteWithoutLayout exact path="/initialize" component={ProfileCreatePage} />,
  <RouteWithoutLayout exact path="/authorize" component={AuthorizePage} />,
  <Route exact path="/settings" component={SettingsPage} />,
  <Route exact path="/settings/email" component={SettingsEmailPage} />,
  <Route exact path="/settings/password" component={SettingsPasswordPage} />
];
