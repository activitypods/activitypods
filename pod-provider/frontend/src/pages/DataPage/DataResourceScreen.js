import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@mui/material';
import { useGetIdentity } from 'react-admin';
import ShowView from '../../layout/ShowView';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import JsonView from '@uiw/react-json-view';
import { arrayOf } from '../../utils';
import BackButton from '../../common/buttons/BackButton';
import ResourceCard from '../../common/cards/ResourceCard';

const DataResourceScreen = ({ resource }) => {
  const { data: identity } = useGetIdentity();
  const { data: typeRegistrations } = useTypeRegistrations();

  const typeRegistration = useMemo(
    () =>
      typeRegistrations?.find(reg =>
        arrayOf(reg['solid:forClass']).some(t1 =>
          arrayOf(resource.type || resource['@type']).find(t2 => t1 === t2 || t1 === `as:${t2}`)
        )
      ),
    [resource, typeRegistrations]
  );

  // TODO Use JSON-LD parser to use full URIs
  const labelPredicate = typeRegistration && typeRegistration['apods:labelPredicate']?.replace('as:', '');

  if (!typeRegistrations) return null;

  return (
    <ShowView
      title={(typeRegistration && resource[labelPredicate]) || resource.id || resource['@id']}
      actions={[
        typeRegistration ? (
          <BackButton to={`/data/${encodeURIComponent(typeRegistration['solid:instanceContainer'])}`} />
        ) : (
          <BackButton to="/data" />
        )
      ]}
      asides={[<ResourceCard resource={resource} typeRegistration={typeRegistration} />]}
    >
      <Card sx={{ p: 2 }}>
        <JsonView
          value={resource}
          shortenTextAfterLength={0}
          displayDataTypes={false}
          displayObjectSize={false}
          enableClipboard={false}
          highlightUpdates={false}
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
