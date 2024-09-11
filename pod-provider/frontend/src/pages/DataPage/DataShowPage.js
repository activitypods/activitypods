import React from 'react';
import { useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useResource from '../../hooks/useResource';
import { arrayOf } from '../../utils';
import DataContainerScreen from './DataContainerScreen';
import DataResourceScreen from './DataResourceScreen';

const DataShowPage = () => {
  useCheckAuthenticated();
  const { resourceUri } = useParams();
  const { data: resource, isLoaded } = useResource(resourceUri);

  if (!isLoaded) {
    return <CircularProgress />;
  } else if (arrayOf(resource.type || resource['@type']).includes('ldp:Container')) {
    return <DataContainerScreen container={resource} />;
  } else {
    return <DataResourceScreen resource={resource} />;
  }
};

export default DataShowPage;
