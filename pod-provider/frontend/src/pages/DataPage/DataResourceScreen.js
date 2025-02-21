import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@mui/material';
import { useGetIdentity } from 'react-admin';
import ShowView from '../../layout/ShowView';
import JsonView from '@uiw/react-json-view';
import BackButton from '../../common/buttons/BackButton';
import ResourceCard from '../../common/cards/ResourceCard';
import { useContainers } from '@semapps/semantic-data-provider';

const DataResourceScreen = ({ resource }) => {
  const { data: identity } = useGetIdentity();
  const [container] = useContainers({ types: resource.type || resource['@type'] });

  console.log('container', container);

  return (
    <ShowView
      title={(container && resource[container.labelPredicate]) || resource.id || resource['@id']}
      actions={[
        container ? <BackButton to={`/data/${encodeURIComponent(container.uri)}`} /> : <BackButton to="/data" />
      ]}
      asides={[<ResourceCard resource={resource} container={container} />]}
    >
      <Card sx={{ p: 2, overflowX: 'auto' }}>
        <JsonView
          value={resource}
          shortenTextAfterLength={0}
          displayDataTypes={false}
          displayObjectSize={false}
          enableClipboard={false}
          highlightUpdates={false}
          style={{ minWidth: '750px' }}
        >
          <JsonView.String
            render={({ children, style, ...rest }, { value, keyName }) => {
              if (value?.startsWith(identity.id) && value !== (resource.id || resource['@id'])) {
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
