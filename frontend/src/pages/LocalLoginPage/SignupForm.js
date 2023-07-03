import React from 'react';
import PropTypes from 'prop-types';
import { Field, Form } from 'react-final-form';
import createSlug from 'speakingurl';
import { useTranslate, useNotify, useSafeSetState, email, required } from 'react-admin';
import { useLocation } from 'react-router-dom';
import { Button, Box, CircularProgress, makeStyles } from '@material-ui/core';
import { useSignup } from '@semapps/auth-provider';
import TextInput from './TextInput';

const useStyles = makeStyles((theme) => ({
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
}));

const SignupForm = ({ redirectTo }) => {
  const [loading, setLoading] = useSafeSetState(false);
  const signup = useSignup();
  const translate = useTranslate();
  const notify = useNotify();
  const classes = useStyles();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  const validateEmail = email('ra.validation.email');
  const validate = (values) => {
    const errors = { username: undefined, email: undefined, password: undefined };

    if (!values.username) {
      errors.username = translate('ra.validation.required');
    }

    if (!values.email) {
      errors.email = translate('ra.validation.required');
    } else {
      // If email is set, check if it's valid.
      const emailValidationResult = validateEmail(values.email);
      if (emailValidationResult) {
        errors.email = translate(emailValidationResult.message);
      }
    }

    if (!values.password) {
      errors.password = translate('ra.validation.required');
    }
    return errors;
  };

  const submit = (values) => {
    setLoading(true);
    signup({
      ...values,
      preferredLocale: process.env.REACT_APP_LANG,
    })
      .then((webId) => {
        setTimeout(() => {
          // Reload to ensure the dataServer config is reset
          window.location.reload();
          window.location.href = '/initialize?redirect=' + encodeURIComponent(redirectTo || '/');
          setLoading(false);
        }, 4000);
        notify('auth.message.new_user_created', 'info');
      })
      .catch((error) => {
        setLoading(false);
        notify(
          typeof error === 'string'
            ? error
            : typeof error === 'undefined' || !error.message
            ? 'ra.auth.sign_in_error'
            : error.message,
          'warning',
          {
            _: typeof error === 'string' ? error : error && error.message ? error.message : undefined,
          }
        );
      });
  };

  return (
    <Form
      onSubmit={submit}
      validate={validate}
      initialValues={{ email: searchParams.get('email') }}
      render={({ handleSubmit }) => (
        <form onSubmit={handleSubmit} noValidate autoComplete="off">
          <div className={classes.form}>
            <div className={classes.input}>
              <Field
                id="username"
                name="username"
                component={TextInput}
                label={translate('auth.input.username')}
                format={(value) =>
                  value
                    ? createSlug(value, {
                        lang: navigator.language.substring(0, 2),
                        separator: '_',
                        custom: ['.', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
                      })
                    : ''
                }
                disabled={loading}
                autoComplete="off"
              />
            </div>
            <div className={classes.input}>
              <Field
                id="email"
                name="email"
                component={TextInput}
                label={translate('auth.input.email')}
                format={(value) => (value ? value.toLowerCase() : '')}
                disabled={loading || (searchParams.has('email') && searchParams.has('force-email'))}
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
                autoComplete="new-password"
              />
            </div>
          </div>
          <Box pl={2} pr={2}>
            <Button variant="contained" type="submit" color="secondary" disabled={loading} className={classes.button}>
              {loading && <CircularProgress className={classes.icon} size={18} thickness={2} />}
              {translate('auth.action.signup')}
            </Button>
          </Box>
        </form>
      )}
    />
  );
};

SignupForm.propTypes = {
  redirectTo: PropTypes.string,
};

export default SignupForm;
