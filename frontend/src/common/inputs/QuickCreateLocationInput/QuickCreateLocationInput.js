import React from 'react';
import { SelectInput } from 'react-admin';
import { ReferenceInput } from '@semapps/input-components';
import AddLocationButton from "./AddLocationButton";

const QuickCreateLocationInput = ({ reference, source, ...rest }) => (
  <div>
    <ReferenceInput reference={reference} source={source} {...rest}>
      <SelectInput optionText="vcard:given-name" resettable />
    </ReferenceInput>
    <AddLocationButton reference={reference} source={source} />
  </div>
);

export default QuickCreateLocationInput;
