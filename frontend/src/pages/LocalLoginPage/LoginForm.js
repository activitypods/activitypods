import React from 'react';
import { Field, Form } from 'react-final-form';
import { Button, CardActions, CircularProgress } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { useTranslate, useLogin, useNotify, useSafeSetState } from 'react-admin';
import TextInput from '../../common/inputs/TextInput';

const useStyles = makeStyles(
  theme => ({
    form: {
      padding: '0 1em 1em 1em'
    },
    input: {
      marginTop: '1em'
    },
    button: {
      width: '100%'
    },
    icon: {
      marginRight: theme.spacing(1)
    }
  }),
  { name: 'RaLoginForm' }
);

const LoginForm = props => {
  const { redirectTo } = props;
  const [loading, setLoading] = useSafeSetState(false);
  const login = useLogin();
  const translate = useTranslate();
  const notify = useNotify();
  const classes = useStyles(props);

  const validate = values => {
    const errors = { username: undefined, password: undefined };

    if (!values.username) {
      errors.username = translate('ra.validation.required');
    }
    if (!values.password) {
      errors.password = translate('ra.validation.required');
    }
    return errors;
  };

  const submit = values => {
    setLoading(true);
    login(values, redirectTo)
      .then(() => {
        setLoading(false);
      })
      .catch(error => {
        setLoading(false);
        notify(
          typeof error === 'string'
            ? error
            : typeof error === 'undefined' || !error.message
            ? 'ra.auth.sign_in_error'
            : error.message,
          {
            type: 'warning',
            messageArgs: {
              _: typeof error === 'string' ? error : error && error.message ? error.message : undefined
            }
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
                autoFocus
                id="username"
                name="username"
                component={TextInput}
                label={translate('auth.input.username_or_email')}
                format={value => (value ? value.toLowerCase() : '')}
                disabled={loading}
              />
            </div>
            <div className={classes.input}>
              <Field
                id="password"
                name="password"
                component={TextInput}
                label={translate('ra.auth.password')}
                type="password"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>
          <CardActions>
            <Button variant="contained" type="submit" color="secondary" disabled={loading} className={classes.button}>
              {loading && <CircularProgress className={classes.icon} size={18} thickness={2} />}
              {translate('ra.auth.sign_in')}
            </Button>
          </CardActions>
        </form>
      )}
    />
  );
};

export default LoginForm;
