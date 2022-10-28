import React from 'react';
import { Link } from 'react-admin';
import { makeStyles, Typography, Box, Button, Grid, Container, useMediaQuery } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
  background: {
    backgroundColor: 'white',
    display: 'flex',
    justifyContent: 'center',
  },
  title: {
    marginTop: 5,
    lineHeight: 1,
  },
  button: {
    marginRight: 10,
  },
}));

const HeaderTitle = ({ children, actions, record }) => {
  const classes = useStyles();
  const xs = useMediaQuery((theme) => theme.breakpoints.down('xs'), { noSsr: true });
  return (
    <Box width={1} className={classes.background}>
      <Container>
        <Box pt={xs ? 3 : 4} pb={xs ? 3 : 4}>
          <Grid container spacing={3}>
            <Grid item xs={8}>
              <Typography variant="h2" className={classes.title} id="react-admin-title">
                {typeof children === 'string' ? children : React.cloneElement(children, { record })}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Box textAlign="right">
                {actions &&
                  Object.entries(actions).map(([url, label], i) => (
                    <Link to={url} key={i}>
                      <Button variant="contained" color="primary">
                        {label}
                      </Button>
                    </Link>
                  ))}
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default HeaderTitle;
