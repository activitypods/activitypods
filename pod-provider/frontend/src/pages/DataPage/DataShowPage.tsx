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
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  const { resourceUri } = useParams();
  // @ts-expect-error TS(2345): Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
  const canDisplayResource = isStorageUri(resourceUri, identity?.id);
  // @ts-expect-error TS(2322): Type 'string | boolean' is not assignable to type ... Remove this comment to see the full error message
  const { data: resourceData, isLoaded } = useResource(resourceUri, { enabled: canDisplayResource });

  if (identity?.id && !canDisplayResource) {
    return (
      <Alert severity="error" sx={{ mt: 3 }}>
        {translate('app.message.cannot_display_resource')}
      </Alert>
    );
  } else if (!isLoaded) {
    return <CircularProgress />;
    // @ts-expect-error TS(2339): Property 'type' does not exist on type 'never[]'.
  } else if (arrayOf(resourceData.type || resourceData['@type']).includes('ldp:Container')) {
    return <DataContainerScreen containerData={resourceData} />;
  } else {
    return <DataResourceScreen resourceData={resourceData} />;
  }
};

export default DataShowPage;
