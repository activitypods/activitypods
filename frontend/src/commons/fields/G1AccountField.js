import React from 'react';
import { useTranslate } from "react-admin";
import { makeStyles, TextField, Typography } from "@material-ui/core";
import { g1UrlToPublicKey } from '../../utils';
import CopyButton from "../buttons/CopyButton";

const useStyles = makeStyles((theme) => ({
  root: {
    // maxWidth: 480
  },
  input: {
    paddingTop: 6
  },
}));

const G1AccountField = ({ record, source }) => {
  const classes = useStyles();
  const translate = useTranslate();
  const publicKey = record && g1UrlToPublicKey(record[source]);
  return(
    <>
      <Typography>{translate('app.helper.g1_tipjar_field')}</Typography>
      <TextField
        variant="filled"
        margin="dense"
        value={publicKey}
        fullWidth
        InputLabelProps={{ shrink: false }}
        InputProps={{ endAdornment: <CopyButton text={publicKey} />, classes: { root: classes.root, input: classes.input } }}
      />
    </>
  )
};

G1AccountField.defaultProps = {
  addLabel: true,
};

export default G1AccountField;
