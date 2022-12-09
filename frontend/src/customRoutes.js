import React from 'react';
import { RouteWithoutLayout } from 'react-admin';
import { Route } from "react-router-dom";
import HomePage from './pages/HomePage';
import SettingsPage from "./pages/SettingsPage";

export default [
  <RouteWithoutLayout exact path="/" component={HomePage} />,
  <Route exact path="/settings" component={SettingsPage} />,
];
