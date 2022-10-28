import React from 'react';
import { useEditContext, Toolbar, SaveButton } from 'react-admin';
import { Container } from '@material-ui/core';
import HeaderTitle from './HeaderTitle';

const NoDeleteToolbar = (props) => (
  <Toolbar {...props}>
    <SaveButton />
  </Toolbar>
);

const EditPage = ({ undoable, mutationMode, title, actions, className, hasDelete = true, children, ...rest }) => {
  const {
    basePath,
    defaultTitle,
    // hasList,
    // hasShow,
    record,
    redirect,
    resource,
    save,
    saving,
    version,
  } = useEditContext(rest);

  if (!record) return null;

  return (
    <>
      <HeaderTitle actions={actions} record={record}>
        {title || defaultTitle}
      </HeaderTitle>
      <br />
      <Container>
        {React.cloneElement(React.Children.only(children), {
          resource,
          basePath,
          record,
          saving,
          save,
          undoable,
          mutationMode,
          version,
          redirect,
          component: 'div',
          toolbar: hasDelete ? undefined : <NoDeleteToolbar />,
        })}
      </Container>
    </>
  );
};

export default EditPage;
