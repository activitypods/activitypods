import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslate } from 'react-admin';
import { Alert, CircularProgress } from '@mui/material';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useResource from '../../hooks/useResource';
import { arrayOf, isStorageUri } from '../../utils';
import DataContainerScreen from './DataContainerScreen';
import DataResourceScreen from './DataResourceScreen';

const DataShowPage = () => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  const { resourceUri } = useParams();
  const canDisplayResource = isStorageUri(resourceUri, identity?.id);
  const { data: resourceData, isLoaded } = useResource(resourceUri, { enabled: canDisplayResource });

  if (identity?.id && !canDisplayResource) {
    return (
      <Alert severity="error" sx={{ mt: 3 }}>
        {translate('app.message.cannot_display_resource')}
      </Alert>
    );
  } else if (!isLoaded) {
    return <CircularProgress />;
  } else if (arrayOf(resourceData.type || resourceData['@type']).includes('ldp:Container')) {
    return <DataContainerScreen containerData={resourceData} />;
  } else {
    return <DataResourceScreen resourceData={resourceData} />;
  }
};

export default DataShowPage;
