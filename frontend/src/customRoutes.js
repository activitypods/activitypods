import React from 'react';
import { RouteWithoutLayout } from 'react-admin';
import { Route } from "react-router-dom";
import HomePage from './pages/HomePage';
import InboxPage from './pages/InboxPage';

export default [
  <RouteWithoutLayout exact path="/" component={HomePage} />,
  <Route exact path="/Inbox" component={InboxPage} />,
];
