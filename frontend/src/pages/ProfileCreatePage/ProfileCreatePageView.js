import React, { useMemo } from 'react';
import {
  Notification,
  TextInput,
  SimpleForm,
  ImageInput,
  ImageField,
  useEditContext
} from 'react-admin';
import { Card, Avatar, makeStyles, Typography, Box } from '@material-ui/core';
import AccountCircleIcon from '@material-ui/icons/AccountCircle';

const useStyles = makeStyles((theme) => ({
  main: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    height: '1px',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: theme.palette.primary.main
  },
  card: {
    minWidth: 300,
    maxWidth: 500,
    marginTop: '6em',
    [theme.breakpoints.down('sm')]: {
      marginTop: '2em',
    },
  },
  avatar: {
    margin: '1em',
    display: 'flex',
    justifyContent: 'center',
  },
  icon: {
    backgroundColor: theme.palette.secondary[500],
  },
  switch: {
    margin: '1em',
    display: 'grid',
    textAlign: 'center',
    justifyContent: 'center',
  },
}));

const ProfileCreatePageView = ({ location }) => {
  const classes = useStyles();
  const searchParams = new URLSearchParams(location.search);
  const editContext = useEditContext();
  const redirect = useMemo(() => {
    const redirectUrl = searchParams.get('redirect');
    if (!redirectUrl) {
      return '/';
    } else if (redirectUrl.startsWith('/')) {
      return redirectUrl;
    } else if (redirectUrl.startsWith('http')) {
      return '/authorize?redirect=' + encodeURIComponent(redirectUrl);
    }
  }, [searchParams]);

  return (
    <Box className={classes.main}>
      <Card className={classes.card}>
        <div className={classes.avatar}>
          <Avatar className={classes.icon}>
            <AccountCircleIcon />
          </Avatar>
        </div>
        <Box pl={2} pr={2}>
          <Typography variant="body2" align="center">
            Maintenant que votre compte est créé, veuillez créer votre profil. Celui-ci ne sera visible par défaut
            que des personnes que vous acceptez dans votre réseau.
          </Typography>
        </Box>
        <SimpleForm {...editContext} redirect={redirect}>
          <TextInput source="vcard:given-name" fullWidth />
          <TextInput source="vcard:note" fullWidth />
          <ImageInput source="vcard:photo" accept="image/*">
            <ImageField source="src" />
          </ImageInput>
        </SimpleForm>
      </Card>
      <Notification />
    </Box >
  );
};

export default ProfileCreatePageView;
