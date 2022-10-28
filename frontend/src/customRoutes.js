import React from 'react';
import { RouteWithoutLayout } from 'react-admin';
import HomePage from './pages/HomePage';
import InboxPage from './pages/InboxPage';
import { Route } from "react-router-dom";

export default [
  <RouteWithoutLayout exact path="/" component={HomePage} />,
  <Route exact path="/Inbox" component={InboxPage} />,
];
