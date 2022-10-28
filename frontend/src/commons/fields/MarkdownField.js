import React from 'react';
import { Typography, makeStyles } from '@material-ui/core';
import { MarkdownField as SemAppsMarkdownField } from '@semapps/markdown-components';

const useStyles = makeStyles((theme) => ({
  p: {
    // Make visible all return lines
    // See https://github.com/remarkjs/react-markdown/issues/273#issuecomment-683754992
    whiteSpace: 'pre-wrap',
    '&:first-of-type': {
      marginTop: 10,
    },
    marginBottom: 10,
  },
  h5: {
    marginTop: 20,
    marginBottom: 5,
    fontWeight: 500
  },
  h6: {
    marginTop: 20,
    marginBottom: 5,
    fontSize: '1.3rem',
    fontWeight: 500
  },
}));

const MarkdownField = (props) => {
  const classes = useStyles();
  return (
    <SemAppsMarkdownField
      overrides={{
        p: (props) => <Typography variant="body1" {...props} className={classes.p} />,
        span: (props) => <Typography variant="body1" {...props} className={classes.p} />,
        h1: (props) => <Typography variant="h5" paragraph {...props} className={classes.h5} />,
        h2: (props) => <Typography variant="h5" paragraph {...props} className={classes.h6} />,
        li: (props) => (
          <li>
            <Typography variant="body1" {...props} className={classes.p} />
          </li>
        ),
      }}
      {...props}
    />
  );
};

MarkdownField.defaultProps = {
  addLabel: true,
};

export default MarkdownField;
