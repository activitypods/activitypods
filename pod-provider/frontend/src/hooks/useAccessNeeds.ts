import { useEffect, useState } from 'react';
import { fetchUtils, useGetIdentity } from 'react-admin';
import { arrayOf } from '../utils';

/**
 * The access needs of the app on the Pod of the user, or of the group they manage (podOwner).
 * The groups targeting another storage are accepted by its owner, not by the user.
 */
const useAccessNeeds = (application: any, podOwner?: string | null) => {
  const { data: identity } = useGetIdentity();
  const [requiredAccessNeeds, setRequiredAccessNeeds] = useState([]);
  const [optionalAccessNeeds, setOptionalAccessNeeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (application && identity && !loading && !loaded && !error) {
          setLoading(true);
          const accessNeedGroups = await Promise.all(
            arrayOf(application['interop:hasAccessNeedGroup']).map(async uri => (await fetchUtils.fetchJson(uri)).json)
          );
          const ownerWebId = podOwner || identity.id;
          const { json: owner } = await fetchUtils.fetchJson(ownerWebId as string);
          const targeted = accessNeedGroups.some(group => group['interop:targetStorage']);
          for (const accessNeedGroup of accessNeedGroups) {
            if (
              targeted &&
              (accessNeedGroup['interop:targetStorage']
                ? accessNeedGroup['interop:targetStorage'] !== owner['pim:storage']
                : !!podOwner)
            )
              continue;
            for (const accessNeedUri of arrayOf(accessNeedGroup['interop:hasAccessNeed'])) {
              const { json: accessNeed } = await fetchUtils.fetchJson(accessNeedUri);
              if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
                // @ts-expect-error TS(2345): Argument of type '(a: never[]) => any[]' is not as... Remove this comment to see the full error message
                setRequiredAccessNeeds(a => [...a, accessNeed]);
              } else {
                // @ts-expect-error TS(2345): Argument of type '(a: never[]) => any[]' is not as... Remove this comment to see the full error message
                setOptionalAccessNeeds(a => [...a, accessNeed]);
              }
            }
            for (const specialRight of arrayOf(accessNeedGroup['apods:hasSpecialRights'])) {
              if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
                // @ts-expect-error TS(2345): Argument of type '(a: never[]) => any[]' is not as... Remove this comment to see the full error message
                setRequiredAccessNeeds(a => [...a, specialRight]);
              } else {
                // @ts-expect-error TS(2345): Argument of type '(a: never[]) => any[]' is not as... Remove this comment to see the full error message
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
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        setError(e.message);
      }
    })();
  }, [
    application,
    podOwner,
    identity,
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
