import React from 'react';
import { ResourceContextProvider, ShowContextProvider, useShowController } from 'react-admin';
import ShowView from './ShowView';

const Show = (props: any) => {
  const controllerProps = useShowController(props);
  return (
    <ResourceContextProvider value={props.resource}>
      <ShowContextProvider value={controllerProps}>
        <ShowView {...props} {...controllerProps} />
      </ShowContextProvider>
    </ResourceContextProvider>
  );
};

export default Show;
