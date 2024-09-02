import React from 'react';
import { useRecordContext } from 'react-admin';
import CopyButton from '../buttons/CopyButton';
import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles(() => ({
  wrapper: {
    position: 'relative'
  },
  text: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    marginRight: 15
  },
  copyButton: {
    position: 'absolute',
    top: -8,
    right: -8
  }
}));

const UsernameField = ({ showCopyButton }) => {
  const record = useRecordContext();
  const classes = useStyles();

  if (!record) return null;

  const actorServer = new URL(record.id).hostname;
  const webfingerId = `@${record.preferredUsername}@${actorServer}`;

  return (
    <div className={classes.wrapper}>
      <div className={classes.text}>
        {webfingerId}
        {showCopyButton && <CopyButton text={webfingerId} className={classes.copyButton} />}
      </div>
    </div>
  );
};

UsernameField.defaultProps = {
  addLabel: true,
  showCopyButton: true
};

export default UsernameField;
