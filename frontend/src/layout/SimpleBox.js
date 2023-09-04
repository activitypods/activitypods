import React from 'react';
import { Box, Card, Typography } from "@mui/material";
import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles((theme) => ({
  '@global': {
    body: {
      backgroundColor: theme.palette.primary.main
    }
  },
  card: {
    minWidth: 300,
    maxWidth: 500,
    marginTop: '6em',
    [theme.breakpoints.down('sm')]: {
      margin: '1em',
    },
  },
  icon: {
    marginTop: 5,
    marginRight: 5
  },
  title: {
    [theme.breakpoints.down('sm')]: {
      fontWeight: 'bold',
      marginTop: 12
    },
  }
}));

const SimpleBox = ({ title, icon, text, children }) => {
  const classes = useStyles();
  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      <Card className={classes.card}>
        <Box p={2} display="flex" justifyContent="start">
          {React.cloneElement(icon, { fontSize: "large", className: classes.icon })}
          <Typography variant="h4" className={classes.title}>{title}</Typography>
        </Box>
        <Box pl={2} pr={2}>
          <Typography variant="body1">{text}</Typography>
        </Box>
        {children}
      </Card>
    </Box>
  );
};

export default SimpleBox;
