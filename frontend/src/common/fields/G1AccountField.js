import React from 'react';
import { g1UrlToPublicKey } from '../../utils';
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
    top: -3,
    right: -3
  }
}));

const G1AccountField = ({ record, source }) => {
  const publicKey = record && g1UrlToPublicKey(record[source]);
  const classes = useStyles();
  return(
    <div className={classes.wrapper}>
      <div className={classes.text}>
        {publicKey}
        <CopyButton text={publicKey} className={classes.copyButton} />
      </div>
    </div>
  );
};

G1AccountField.defaultProps = {
  addLabel: true,
};

export default G1AccountField;
