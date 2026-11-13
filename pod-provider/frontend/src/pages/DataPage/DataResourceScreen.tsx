import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@mui/material';
import ShowView from '../../layout/ShowView';
import JsonView from '@uiw/react-json-view';
import BackButton from '../../common/buttons/BackButton';
import ResourceCard from '../../common/cards/ResourceCard';
import { useCompactPredicate } from '@semapps/semantic-data-provider';
import useRealmContext from '../../hooks/useRealmContext';
import usePodContainers from '../../hooks/usePodContainers';
import useDataPagePath from '../../hooks/useDataPagePath';
import { isStorageUri } from '../../utils';

const DataResourceScreen = ({ resourceData }: any) => {
  const { data: pod } = useRealmContext() as any;
  const getPath = useDataPagePath();
  const resourceUri = resourceData.id || resourceData['@id'];
  const container = usePodContainers()?.find(c => resourceUri.startsWith(`${c.uri}/`));
  // @ts-expect-error TS(2345): Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
  const labelPredicate = useCompactPredicate(container?.labelPredicate, resourceData['@context']);

  return (
    <ShowView
      title={(labelPredicate && resourceData[labelPredicate]) || resourceData.id || resourceData['@id']}
      actions={[<BackButton to={getPath(container?.uri)} />]}
      asides={[<ResourceCard resource={resourceData} labelPredicate={labelPredicate} />]}
    >
      <Card sx={{ p: 2, overflowX: 'auto' }}>
        <JsonView
          value={resourceData}
          shortenTextAfterLength={0}
          displayDataTypes={false}
          displayObjectSize={false}
          enableClipboard={false}
          highlightUpdates={false}
          style={{ minWidth: '750px' }}
        >
          <JsonView.String
            render={({ children, style, ...rest }, { value, keyName }) => {
              // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
              if (isStorageUri(value, pod?.id) && value !== resourceUri) {
                return (
                  // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
                  <Link to={getPath(value)} style={{ ...style, cursor: 'pointer' }} {...rest}>
                    {children}
                  </Link>
                );
              } else {
                return (
                  <span style={style} {...rest}>
                    {children}
                  </span>
                );
              }
            }}
          />
        </JsonView>
      </Card>
    </ShowView>
  );
};

export default DataResourceScreen;
