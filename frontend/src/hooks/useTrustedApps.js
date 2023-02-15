import { useEffect, useState } from "react";
import { useNotify } from "react-admin";


const useTrustedApps = () => {
  const [trustedApps, setTrustedApps] = useState([]);
  const notify = useNotify();

  useEffect(() => {
    (async () => {
      if (trustedApps.length === 0) {
        const results = await fetch('https://data.activitypods.org/trusted-apps', {
          headers: {
            Accept: 'application/ld+json'
          }
        });
        if (results.ok) {
          const json = await results.json();
          setTrustedApps(json['ldp:contains'].map(app => app['apods:domainName']));
        } else {
          notify('app.notification.verified_applications_load_failed', 'error');
        }
      }
    })();
  }, [trustedApps, setTrustedApps, notify]);

  return trustedApps;
};

export default useTrustedApps;