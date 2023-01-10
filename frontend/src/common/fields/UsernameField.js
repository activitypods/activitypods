import React from "react";
import { useRecordContext } from 'react-admin';
import { formatUsername } from "../../utils";
import CopyButton from "../buttons/CopyButton";
import {makeStyles} from "@material-ui/core";

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
    top: -3,
    right: -3
  }
}));

const UsernameField = (props) => {
  const { source } = props;
  const record = useRecordContext(props);
  const classes = useStyles();

  if (!record || !record[source]) return null;

  return(
    <div className={classes.wrapper}>
      <div className={classes.text}>
        {formatUsername(record[source])}
        <CopyButton text={formatUsername(record[source])} className={classes.copyButton} />
      </div>
    </div>
  );
}

UsernameField.defaultProps = {
  addLabel: true
};

export default UsernameField;
