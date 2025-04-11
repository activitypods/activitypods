import { useCallback, useEffect, useState, useLayoutEffect } from 'react';
import urlJoin from 'url-join';
import ErrorMessage from './ErrorMessage';

const BackgroundChecks = ({ children }: any) => {
  const [isOnline, setIsOnline] = useState();

  const checkBackendStatus = useCallback(async () => {
    // Only proceed if the tab is visible
    if (!document.hidden) {
      try {
        const response = await fetch(urlJoin(CONFIG.BACKEND_URL, '.well-known/config.js'));
        // @ts-expect-error TS(2345): Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
        setIsOnline(response.ok);
      } catch (e) {
        // @ts-expect-error TS(2345): Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
        setIsOnline(false);
      }
    }
  }, [setIsOnline, document]);

  // Check backend status on first load and every 2 minutes
  useEffect(() => {
    checkBackendStatus();
    const timerId = setInterval(checkBackendStatus, 120000);
    return () => clearInterval(timerId);
  }, [checkBackendStatus]);

  // Check backend status when the tab change
  useLayoutEffect(() => {
    document.addEventListener('visibilitychange', checkBackendStatus);
    return () => document.removeEventListener('visibilitychange', checkBackendStatus);
  }, [checkBackendStatus]);

  if (isOnline === true) {
    return children;
  } else if (isOnline === false) {
    // @ts-expect-error TS(2686): 'React' refers to a UMD global, but the current fi... Remove this comment to see the full error message
    return <ErrorMessage message="app.message.backend_offline" />;
  }
  {
    return null;
  }
};

export default BackgroundChecks;
