import { useEffect, useState } from 'react';
import { fetchUtils } from 'react-admin';
import { arrayOf } from '../utils';

const useAccessNeeds = application => {
  const [requiredAccessNeeds, setRequiredAccessNeeds] = useState([]);
  const [optionalAccessNeeds, setOptionalAccessNeeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (application && !loading && !loaded && !error) {
          setLoading(true);
          for (const accessNeedGroupUri of arrayOf(application['interop:hasAccessNeedGroup'])) {
            const { json: accessNeedGroup } = await fetchUtils.fetchJson(accessNeedGroupUri);
            for (const accessNeedUri of arrayOf(accessNeedGroup['interop:hasAccessNeed'])) {
              const { json: accessNeed } = await fetchUtils.fetchJson(accessNeedUri);
              if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
                setRequiredAccessNeeds(a => [...a, accessNeed]);
              } else {
                setOptionalAccessNeeds(a => [...a, accessNeed]);
              }
            }
            for (const specialRight of arrayOf(accessNeedGroup['apods:hasSpecialRights'])) {
              if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
                setRequiredAccessNeeds(a => [...a, specialRight]);
              } else {
                setOptionalAccessNeeds(a => [...a, specialRight]);
              }
            }
          }
          setLoaded(true);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        setLoading(false);
        setError(e.message);
      }
    })();
  }, [
    application,
    setRequiredAccessNeeds,
    setOptionalAccessNeeds,
    loading,
    setLoading,
    loaded,
    setLoaded,
    error,
    setError
  ]);

  return { requiredAccessNeeds, optionalAccessNeeds, loading, loaded, error };
};

export default useAccessNeeds;
