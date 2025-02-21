import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@mui/material';
import { useGetIdentity } from 'react-admin';
import ShowView from '../../layout/ShowView';
import JsonView from '@uiw/react-json-view';
import BackButton from '../../common/buttons/BackButton';
import ResourceCard from '../../common/cards/ResourceCard';
import { useContainers, useCompactPredicate } from '@semapps/semantic-data-provider';

const DataResourceScreen = ({ resourceData }) => {
  const { data: identity } = useGetIdentity();
  const [container] = useContainers({ types: resourceData.type || resourceData['@type'] });
  const labelPredicate = useCompactPredicate(container?.labelPredicate, resourceData['@context']);

  return (
    <ShowView
      title={(labelPredicate && resourceData[labelPredicate]) || resourceData.id || resourceData['@id']}
      actions={[
        container ? <BackButton to={`/data/${encodeURIComponent(container.uri)}`} /> : <BackButton to="/data" />
      ]}
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
              if (value?.startsWith(identity?.id) && value !== (resourceData.id || resourceData['@id'])) {
                return (
                  <Link to={`/data/${encodeURIComponent(value)}`} style={{ ...style, cursor: 'pointer' }} {...rest}>
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
