import React from 'react';
import { RouteWithoutLayout } from 'react-admin';
import HomePage from './pages/HomePage';
import UserPage from './pages/UserPage';
import SettingsPage from './pages/SettingsPage';
import { Route } from "react-router-dom";

export default [
  <RouteWithoutLayout exact path="/" component={HomePage} />,
  <RouteWithoutLayout exact path="/u/:id" component={UserPage} />,
  <Route exact path="/account/settings" component={SettingsPage} />,
];
