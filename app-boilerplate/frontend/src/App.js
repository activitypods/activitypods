import React from 'react';
import { Admin, Resource, memoryStore } from 'react-admin';
import { BrowserRouter } from 'react-router-dom';
import { StyledEngineProvider } from '@mui/material/styles';
import { PodLoginPage } from '@semapps/auth-provider';

import authProvider from './config/authProvider';
import dataProvider from './config/dataProvider';
import * as resources from './resources';

const customPodProviders = process.env.REACT_APP_POD_PROVIDER_DOMAIN_NAME && [
  { 'apods:domainName': process.env.REACT_APP_POD_PROVIDER_DOMAIN_NAME, 'apods:area': 'Local' }
];

const LoginPage = props => <PodLoginPage customPodProviders={customPodProviders} {...props} />;

const App = () => (
  <StyledEngineProvider injectFirst>
    <BrowserRouter>
      <Admin
        title={process.env.REACT_APP_NAME}
        authProvider={authProvider}
        dataProvider={dataProvider}
        loginPage={LoginPage}
        store={memoryStore()}
      >
        {Object.entries(resources).map(([key, resource]) => (
          <Resource key={key} name={key} {...resource.config} />
        ))}
      </Admin>
    </BrowserRouter>
  </StyledEngineProvider>
);

export default App;
