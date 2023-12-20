import React, { useState, useCallback } from 'react';
import { SelectInput } from 'react-admin';
import { ReferenceInput } from '@semapps/input-components';
import AddLocationButton from './AddLocationButton';

const QuickCreateLocationInput = ({ reference, source, onChange, ...rest }) => {
  // Needed to trigger orm change and enable save button :
  // https://codesandbox.io/s/react-admin-v3-advanced-recipes-quick-createpreview-voyci
  const [version, setVersion] = useState(0);
  const handleChange = useCallback(() => {
    setVersion(version + 1);
    onChange();
  }, [setVersion, version, onChange]);

  return (
    <div>
      <ReferenceInput key={version} reference={reference} source={source} {...rest}>
        <SelectInput optionText="vcard:given-name" resettable />
      </ReferenceInput>
      <AddLocationButton reference={reference} source={source} onChange={handleChange} />
    </div>
  );
};

export default QuickCreateLocationInput;
