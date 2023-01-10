import React from 'react';
import { RouteWithoutLayout } from 'react-admin';
import { Route } from "react-router-dom";
import HomePage from './pages/HomePage';
import SettingsPage from "./pages/SettingsPage";
import ProfileCreatePage from "./pages/ProfileCreatePage/ProfileCreatePage";
import AuthorizePage from "./pages/AuthorizePage/AuthorizePage";
import UserPage from "./pages/UserPage";

export default [
  <RouteWithoutLayout exact path="/" component={HomePage} />,
  <RouteWithoutLayout exact path="/u/:id" component={UserPage} />,
  <RouteWithoutLayout exact path="/initialize" component={ProfileCreatePage} />,
  <RouteWithoutLayout exact path="/authorize" component={AuthorizePage} />,
  <Route exact path="/settings" component={SettingsPage} />,
];
