import React from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { createRoot } from 'react-dom/client';
import './index.css';

// If the global CONFIG object is not set, it means the backend is offline
if (typeof CONFIG !== 'undefined') {
  import('./App').then(({ default: App }) => {
    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
  });
} else {
  // @ts-expect-error TS(2531): Object is possibly 'null'.
  document.getElementById('root').innerHTML =
    '<p>The Pod provider is currently offline. We apologize for the inconvenience.</p>';
}
