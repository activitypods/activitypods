import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// If the global CONFIG object is not set, it means the backend is offline
if (typeof CONFIG !== 'undefined') {
  import('./App').then(({ default: App }) => {
    const root = createRoot(document.getElementById('root'));
    root.render(<App />);
  });
} else {
  document.getElementById('root').innerHTML =
    '<p>The Pod provider is currently offline. We apologize for the inconvenience.</p>';
}
