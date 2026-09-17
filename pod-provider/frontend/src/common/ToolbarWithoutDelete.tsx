import React from 'react';
import { SaveButton, Toolbar } from 'react-admin';

const ToolbarWithoutDelete = (props: any) => (
  <Toolbar {...props}>
    <SaveButton />
  </Toolbar>
);

export default ToolbarWithoutDelete;
