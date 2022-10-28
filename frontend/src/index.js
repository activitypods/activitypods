import React from 'react';
import ReactDOM from 'react-dom';
import jwtDecode from 'jwt-decode';
import * as Sentry from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import './index.css';
import App from './App';

if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SENTRY_DSN) {
  const token = localStorage.getItem('token');
  const userData = token && jwtDecode(token);

  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    integrations: [new Integrations.BrowserTracing()],
    environment: process.env.NODE_ENV,

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    initialScope: userData ? { user: { id: userData.webId, name: userData.name } } : undefined,
  });
}

ReactDOM.render(<App />, document.getElementById('root'));
