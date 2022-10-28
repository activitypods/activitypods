import React, { useRef } from 'react';
import {
  Grid,
  makeStyles,
  Container,
  Box,
  Drawer,
  useMediaQuery,
  useScrollTrigger,
  Typography,
} from '@material-ui/core';
import { TextField, useShowContext, ReferenceField } from 'react-admin';
import JoinButton from '../commons/buttons/JoinButton';

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: 'white',
    paddingTop: 25,
    paddingBottom: 10,
    [theme.breakpoints.down('xs')]: {
      paddingTop: 10,
      paddingBottom: 0,
      marginBottom: 0,
    },
  },
  breadcrumbs: {
    paddingTop: 15,
    paddingBottom: 10,
  },
  type: {
    paddingTop: 15,
    paddingBottom: 10,
  },
  title: {
    lineHeight: 1.15,
  },
  chevronIcon: {
    color: 'white',
  },
  images: {
    marginBottom: 15,
    '& img': {
      width: '100%',
      display: 'block',
      borderRadius: 8,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      objectFit: 'cover',
      margin: '5px 0 10px 0',
      height: '100%',
      maxHeight: '15rem',
      [theme.breakpoints.down('xs')]: {
        maxHeight: '8rem',
      },
    },
  },
  drawer: {
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

const HeaderShow = ({ type, details, actions }) => {
  const classes = useStyles();
  const { record } = useShowContext();
  const xs = useMediaQuery((theme) => theme.breakpoints.down('xs'), { noSsr: true });

  // Calculate header height
  const headerRef = useRef(null);
  const headerHeight = headerRef?.current?.clientHeight;

  // Trigger drawer when we pass beyond header height
  const showDrawer = useScrollTrigger({ threshold: headerHeight, disableHysteresis: true });

  return (
    <Box className={classes.root}>
      <Container ref={headerRef}>
        <Grid container>
          <Grid item xs={10} sm={9}>
            {type && record && record[type] && (
              <Typography variant="subtitle2" component="div" className={classes.type}>
                <ReferenceField source={type} reference="Format" link={false}>
                  <ReferenceField source="skos:broader" reference="Format" link={false}>
                    <TextField source="rdfs:label" variant="subtitle2" component="span" />
                  </ReferenceField>
                </ReferenceField>
                &nbsp;&nbsp;>&nbsp;&nbsp;
                <ReferenceField source={type} reference="Format" link={false}>
                  <TextField source="rdfs:label" variant="subtitle2" component="span" />
                </ReferenceField>
              </Typography>
            )}
            <TextField source="name" variant="h2" className={classes.title} />
          </Grid>
          <Grid item xs={2} sm={3}>
            <Box display="flex" justifyContent="flex-end" alignItems="flex-end" flexDirection={xs ? 'column' : 'row'}>
              {actions}
            </Box>
          </Grid>
        </Grid>
        <Box display={xs ? 'block' : 'flex'} pt={2} pb={2}>
          {React.cloneElement(details, { orientation: xs ? 'vertical' : 'horizontal' })}
        </Box>
        {xs && (
          <Box pb={3}>
            <JoinButton variant="contained" color="primary" />
          </Box>
        )}
        <Drawer anchor="bottom" open={xs && showDrawer} variant="persistent">
          <Box className={classes.drawer} pt={1} pb={1}>
            <JoinButton variant="contained" color="primary" />
          </Box>
        </Drawer>
      </Container>
    </Box>
  );
};

export default HeaderShow;
