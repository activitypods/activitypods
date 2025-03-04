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
  const { data: resourceData, isLoaded } = useResource(resourceUri);

  if (!isLoaded) {
    return <CircularProgress />;
  } else if (arrayOf(resourceData.type || resourceData['@type']).includes('ldp:Container')) {
    return <DataContainerScreen containerData={resourceData} />;
  } else {
    return <DataResourceScreen resourceData={resourceData} />;
  }
};

export default DataShowPage;
