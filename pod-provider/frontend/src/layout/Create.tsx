import React from 'react';
import { ResourceContextProvider, CreateContextProvider, useCreateController } from 'react-admin';
import CreateView from './CreateView';

const Create = props => {
  const controllerProps = useCreateController(props);
  return (
    <ResourceContextProvider value={props.resource}>
      <CreateContextProvider value={controllerProps}>
        <CreateView {...props} {...controllerProps} />
      </CreateContextProvider>
    </ResourceContextProvider>
  );
};

export default Create;
