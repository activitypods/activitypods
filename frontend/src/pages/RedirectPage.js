import React from 'react';
import { useLocation } from 'react-router';
import { Redirect } from 'react-router-dom';
import { useDataModels } from '@semapps/semantic-data-provider';

const RedirectPage = () => {
  const dataModels = useDataModels();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  if (dataModels) {
    const resource = Object.keys(dataModels).find(key => dataModels[key].types && dataModels[key].types.includes(searchParams.get('type')));
    if (searchParams.has('uri')) {
      return <Redirect push to={`/${resource}/${encodeURIComponent(searchParams.get('uri'))}${searchParams.get('mode') === 'show' ? '/show' : ''}`} />;
    } else {
      return <Redirect push to={`/${resource}`} />;
    }
  } else {
    return null;
  }
};

export default RedirectPage;
