import React from 'react';
import { makeStyles, Container, Box, Avatar, Typography, Hidden } from '@material-ui/core';
import { useShowContext } from 'react-admin';
import { formatUsername } from '../../utils';

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: 'white',
    paddingTop: 25,
    paddingBottom: 25,
    height: 120,
    [theme.breakpoints.down('xs')]: {
      paddingTop: 20,
      paddingBottom: 20,
      marginBottom: 0,
      height: 100,
    },
  },
  container: {
    position: 'relative',
    paddingLeft: 150,
    paddingTop: 15,
    [theme.breakpoints.down('xs')]: {
      paddingLeft: 120,
      paddingTop: 20,
    },
  },
  title: {
    lineHeight: 1.15,
  },
  username: {
    fontStyle: 'italic',
  },
  note: {
    marginTop: 10,
  },
  avatar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 120,
    height: 120,
    [theme.breakpoints.down('xs')]: {
      width: 100,
      height: 100,
    },
  },
}));

const ProfileHeader = () => {
  const classes = useStyles();
  const { record } = useShowContext();
  return (
    <Box className={classes.root}>
      <Container>
        <Box className={classes.container}>
          <Avatar src={record?.['vcard:photo']} alt={record?.['vcard:given-name']} className={classes.avatar} />
          <Typography variant="h2" className={classes.title}>
            {record?.['vcard:given-name']}
          </Typography>
          {record && (
            <Typography variant="body2" className={classes.username}>
              {formatUsername(record.describes)}
            </Typography>
          )}
          <Hidden xsDown>
            <Typography variant="body2" className={classes.note}>
              {record?.['vcard:note']}
            </Typography>
          </Hidden>
        </Box>
      </Container>
    </Box>
  );
};

export default ProfileHeader;
