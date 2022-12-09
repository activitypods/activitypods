import React from 'react';
import { g1UrlToPublicKey } from '../../utils';
import CopyButton from "../buttons/CopyButton";

const G1AccountField = ({ record, source }) => {
  const publicKey = record && g1UrlToPublicKey(record[source]);
  return(
    <span>{publicKey} <CopyButton text={publicKey} /></span>
  )
};

G1AccountField.defaultProps = {
  addLabel: true,
};

export default G1AccountField;
