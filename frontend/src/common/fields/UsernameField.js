import React from "react";
import { useRecordContext } from 'react-admin';
import { formatUsername } from "../../utils";
import CopyButton from "../buttons/CopyButton";
import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles((theme) => ({
  wrapper: {
    position: 'relative',
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

const UsernameField = ({ source, showCopyButton }) => {
  const record = useRecordContext();
  const classes = useStyles();

  if (!record || !record[source]) return null;

  return(
    <div className={classes.wrapper}>
      <div className={classes.text}>
        {formatUsername(record[source])}
        {showCopyButton && <CopyButton text={formatUsername(record[source])} className={classes.copyButton} />}
      </div>
    </div>
  );
}

UsernameField.defaultProps = {
  addLabel: true,
  showCopyButton: true
};

export default UsernameField;
