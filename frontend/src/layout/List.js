import React from 'react';
import { ResourceContextProvider, ListContextProvider, useListController, usePermissions } from 'react-admin';
import { useCreateContainer } from '@semapps/semantic-data-provider';
import ListView from './ListView';

const List = props => {
  const controllerProps = useListController(props);
  const createContainerUri = useCreateContainer(props.resource);
  const { permissions } = usePermissions(createContainerUri);
  return (
    <ResourceContextProvider value={props.resource}>
      <ListContextProvider value={controllerProps}>
        <ListView
          {...controllerProps}
          {...props}
          hasCreate={
            props.hasCreate &&
            !!permissions &&
            permissions.some(p => ['acl:Append', 'acl:Write', 'acl:Control'].includes(p['acl:mode']))
          }
        />
      </ListContextProvider>
    </ResourceContextProvider>
  );
};

export default List;
