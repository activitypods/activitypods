import { useEffect, useState } from 'react';
import { fetchUtils, useGetList } from 'react-admin';
import { arrayOf } from '../utils';

const useClassDescriptions = application => {
  const [appData, setAppData] = useState([]);
  const { data: currentData } = useGetList('ClassDescription');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (application && currentData && !loading && !loaded && !error) {
          setLoading(true);
          for (const accessDescriptionSetUri of arrayOf(application['interop:hasAccessDescriptionSet'])) {
            const { json: accessDescriptionSet } = await fetchUtils.fetchJson(accessDescriptionSetUri);
            if (accessDescriptionSet['interop:usesLanguage'] === CONFIG.DEFAULT_LOCALE) {
              for (const classDescriptionUri of arrayOf(accessDescriptionSet['apods:hasClassDescription'])) {
                const { json: classDescription } = await fetchUtils.fetchJson(classDescriptionUri);
                setAppData(oldData => {
                  oldData.push(classDescription);
                  return oldData;
                });
              }
            }
          }
          setLoaded(true);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        setError(e.message);
        setLoading(false);
      }
    })();
  }, [application, currentData, setAppData, loading, setLoading, loaded, setLoaded, error, setError]);

  return { classDescriptions: loaded ? [...appData, ...currentData] : [], loading, loaded, error };
};

export default useClassDescriptions;
