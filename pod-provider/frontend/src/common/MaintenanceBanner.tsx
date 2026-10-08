import React from 'react';
import { Alert } from '@mui/material';

declare global {
  interface Window {
    /** Set by /maintenance.js, written when the frontend container starts */
    MAINTENANCE_MESSAGE?: string;
  }
}

/** Shown on every page while the MAINTENANCE_MESSAGE env var of the frontend container is set */
const MaintenanceBanner = () =>
  window.MAINTENANCE_MESSAGE ? (
    <Alert severity="warning" sx={{ borderRadius: 0, justifyContent: 'center', whiteSpace: 'pre-line' }}>
      {window.MAINTENANCE_MESSAGE}
    </Alert>
  ) : null;

export default MaintenanceBanner;
