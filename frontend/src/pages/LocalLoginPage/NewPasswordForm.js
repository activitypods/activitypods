import React from 'react';
import { Field, Form } from 'react-final-form';
import { Button, Box, CircularProgress } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { useTranslate, useNotify, useSafeSetState, useAuthProvider } from 'react-admin';
import TextInput from './TextInput';

const useStyles = makeStyles(
  (theme) => ({
    form: {
      padding: '0 1em 1em 1em',
    },
    input: {
      marginTop: '1em',
    },
    button: {
      width: '100%',
    },
    icon: {
      marginRight: theme.spacing(1),
    },
  }),
  { name: 'RaLoginForm' }
);

const NewPasswordForm = (props) => {
  const { location } = props;
  const searchParams = new URLSearchParams(location.search);
  const token = searchParams.get('token');

  const [loading, setLoading] = useSafeSetState(false);
  const authProvider = useAuthProvider()

  const translate = useTranslate();
  const notify = useNotify();
  const classes = useStyles(props);

  const validate = (values) => {
    const errors = { email: undefined };

    if (!values.email) {
      errors.email = translate('ra.validation.required');
    }

    return errors;
  };

  const submit = (values) => {
    setLoading(true);
    authProvider.setNewPassword({ ...values, token })
      .then((res) => {
        setTimeout(() => {
          window.location.href = '/login';
          setLoading(false);
        }, 2000);
        notify('app.notification.password_changed', 'info');
      })
      .catch((error) => {
        setLoading(false);
        notify(
          typeof error === 'string'
            ? error
            : typeof error === 'undefined' || !error.message
              ? 'app.notification.reset_password_error'
              : error.message,
          {
            type: 'warning',
            messageArgs: {
              _: typeof error === 'string' ? error : error && error.message ? error.message : undefined,
            },
          }
        );
      });
  };

  return (
    <Form
      onSubmit={submit}
      validate={validate}
      render={({ handleSubmit }) => (
        <form onSubmit={handleSubmit} noValidate>
          <div className={classes.form}>
            <div className={classes.input}>
              <Field
                id="email"
                name="email"
                component={TextInput}
                label={translate('auth.input.email')}
                format={(value) => (value ? value.toLowerCase() : '')}
              />
            </div>
            <div className={classes.input}>
              <Field
                id="password"
                name="password"
                component={TextInput}
                label={translate('app.input.new_password')}
                type="password"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
            <div className={classes.input}>
              <Field
                id="confirm-password"
                name="confirm-password"
                component={TextInput}
                label={translate('app.input.confirm_new_password')}
                type="password"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>
          <Box pl={2} pr={2}>
            <Button variant="contained" type="submit" color="secondary" disabled={loading} className={classes.button}>
              {loading && <CircularProgress className={classes.icon} size={18} thickness={2} />}
              {translate('app.action.set_new_password')}
            </Button>
          </Box>
        </form >
      )}
    />
  );
};

export default NewPasswordForm;
