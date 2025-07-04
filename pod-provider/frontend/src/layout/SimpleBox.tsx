import React from 'react';
import { Box, Card, Typography } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { Theme } from '@mui/material/styles';

const useStyles = makeStyles((theme: Theme) => ({
  '@global': {
    body: {
      backgroundColor: theme.palette.primary.main
    }
  },
  card: {
    minWidth: 300,
    maxWidth: 500,
    margin: '1em'
  },
  icon: {
    marginTop: 5,
    marginRight: 7
  },
  title: {
    lineHeight: '1.8rem',
    marginTop: 8,
    [theme.breakpoints.down('sm')]: {
      fontWeight: 'bold',
      marginTop: 12
    }
  }
}));

const SimpleBox = ({
  title,
  icon,
  text,
  children,
  infoText
}: {
  title: string;
  icon?: React.ReactElement;
  text?: string;
  infoText?: string | React.ReactElement;
  children: React.ReactNode;
}) => {
  const classes = useStyles();
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      sx={{ pb: { xs: 0, sm: 10 } }}
    >
      <Card className={classes.card} sx={{ padding: 2, display: 'flex', flexDirection: 'column', rowGap: 1 }}>
        <Box pb={text ? 2 : 0} display="flex" justifyContent="start">
          {icon && React.cloneElement(icon, { fontSize: 'large', className: classes.icon })}
          <Typography variant="h4" className={classes.title}>
            {title}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body1">{text}</Typography>
        </Box>
        {children}

        {/* Info Text */}
        {infoText && (
          <Box marginTop="auto" pt={2}>
            <Typography variant="body2">{infoText}</Typography>
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default SimpleBox;
