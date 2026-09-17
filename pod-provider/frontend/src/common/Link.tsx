import React from 'react';
import { Link as LinkUnrefed } from 'react-admin';

/**
 * Mui complains if adding `component` props to e.g. a Button, if the component doesn't have a ref.
 * https://mui.com/material-ui/guides/composition/#caveat-with-refs
 */
const Link = React.forwardRef((props: any, ref: any) => (
  <span ref={ref}>
    <LinkUnrefed {...props} />
  </span>
));

export default Link;
