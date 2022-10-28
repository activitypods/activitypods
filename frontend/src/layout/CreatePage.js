import React from 'react';
import { useCreateContext } from 'react-admin';
import { Container } from '@material-ui/core';
import HeaderTitle from './HeaderTitle';

const CreatePage = ({ title, actions, children, ...rest }) => {
  const createContext = useCreateContext(rest);
  return (
    <>
      <HeaderTitle actions={actions}>{title}</HeaderTitle>
      <br />
      <Container>{React.cloneElement(children, { ...createContext, component: 'div' })}</Container>
    </>
  );
};

export default CreatePage;
