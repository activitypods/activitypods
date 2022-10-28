import React from 'react';
import { Typography, Box, makeStyles, Avatar, Card } from '@material-ui/core';
import { formatUsername } from '../../utils';

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 10em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    height: 90,
    position: 'relative',
  },
  avatarWrapper: {
    position: 'absolute',
    margin: 15,
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  avatar: {
    width: 140,
    height: 140,
  },
  block: {
    backgroundColor: 'white',
    paddingTop: 70,
    paddingBottom: 20,
  },
}));

const AvatarField = ({
  record,
  label,
  username,
  defaultLabel,
  image,
  fallback,
  variant,
  labelColor,
  classes,
  children,
}) => {
  classes = useStyles(classes);
  if (!record) return null;

  const computedLabel = (typeof label === 'function' ? label(record) : record[label]) || defaultLabel;
  const computedImage = typeof image === 'function' ? image(record) : record[image];
  const computedFallback = typeof fallback === 'function' ? fallback(record) : fallback;
  const computedUsername = typeof label === 'function' ? username(record) : record[username];

  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Box display="flex" justifyContent="center" className={classes.avatarWrapper}>
          <Avatar
            src={computedImage || computedFallback}
            alt={computedLabel}
            fallback={computedFallback}
            className={classes.avatar}
            variant={variant}
          />
        </Box>
      </Box>
      <Box className={classes.block}>
        <Typography variant="h4" align="center">
          {computedLabel}
        </Typography>
        <Typography variant="subtitle1" align="center">
          {formatUsername(computedUsername)}
        </Typography>
      </Box>
    </Card>
  );
};

AvatarField.defaultProps = {
  labelColor: 'secondary.main',
};

export default AvatarField;
