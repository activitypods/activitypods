import React from 'react';
import { ResourceContextProvider, EditContextProvider, useEditController } from 'react-admin';
import EditView from "./EditView";

const Edit = (props) => {
  const controllerProps = useEditController(props);
  return(
    <ResourceContextProvider value={props.resource}>
      <EditContextProvider value={controllerProps}>
        <EditView {...props} {...controllerProps} />
      </EditContextProvider>
    </ResourceContextProvider>
  )
};

export default Edit;
