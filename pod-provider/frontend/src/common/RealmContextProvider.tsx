import React, { useState, useEffect, useCallback } from 'react';
import { useDataProvider, useGetIdentity } from 'react-admin';
import { useLocation } from 'react-router-dom';
import { useWebfinger } from '@semapps/activitypub-components';
import RealmContext from '../contexts/RealmContext';

const RealmContextProvider = ({ children }: any) => {
  const [groupData, setGroupData] = useState();
  const [isGroupLoading, setIsGroupLoading] = useState(true);
  const { data: userData, isLoading: isUserLoading, refetch: refetchUser } = useGetIdentity();
  const webfinger = useWebfinger();
  const location = useLocation();
  const dataProvider = useDataProvider();

  const isGroup = location.pathname.startsWith('/group/');
  const webfingerId = isGroup ? location.pathname.split('/')[2] : undefined;

  const loadGroup = useCallback(
    async (groupUri: string) => {
      const { data } = await dataProvider.getOne('Actor', { id: groupUri });
      setGroupData({
        // @ts-expect-error TS(2345): Argument of type '{ id: any; fullName: any; avatar... Remove this comment to see the full error message
        id: data.id,
        fullName: data['foaf:name'] || data.name || data['pair:label'],
        avatar: data.image?.url || data.image || data.icon?.url || data.icon,
        webfingerId,
        webIdData: data
      });
    },
    [dataProvider, webfingerId, setGroupData]
  );

  useEffect(() => {
    if (isGroup) {
      setIsGroupLoading(true);
      webfinger
        .fetch(webfingerId)
        .then(groupUri => loadGroup(groupUri))
        .then(() => setIsGroupLoading(false));
    }
  }, [isGroup, webfingerId, webfinger.fetch, loadGroup]);

  const refetchGroup = useCallback(async () => {
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    await loadGroup(groupData.id);
  }, [groupData, loadGroup]);

  return (
    <RealmContext.Provider
      value={{
        isGroup,
        isLoading: isGroup ? isGroupLoading : isUserLoading,
        data: isGroup ? groupData : userData,
        refetch: isGroup ? refetchGroup : refetchUser
      }}
    >
      {children}
    </RealmContext.Provider>
  );
};

export default RealmContextProvider;
