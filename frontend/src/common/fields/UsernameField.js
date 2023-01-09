import React from "react";
import { useRecordContext } from 'react-admin';
import { formatUsername } from "../../utils";
import CopyButton from "../buttons/CopyButton";

const UsernameField = (props) => {
  const { source } = props;
  const record = useRecordContext(props);
  return record && record[source]
    ? <span>{formatUsername(record[source])} <CopyButton text={formatUsername(record[source])} small /></span>
    : null;
}

UsernameField.defaultProps = {
  addLabel: true
};

export default UsernameField;
