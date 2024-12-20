import React, { useState, useEffect, useCallback } from 'react';
import { useDataProvider, useGetIdentity } from 'react-admin';
import { useLocation } from 'react-router-dom';
import { useWebfinger } from '@semapps/activitypub-components';
import RealmContext from '../contexts/RealmContext';
import { meta } from 'eslint-plugin-prettier';

const RealmContextProvider = ({ children }) => {
  const [groupData, setGroupData] = useState();
  const [isGroupLoading, setIsGroupLoading] = useState(true);
  const { data: userData, isLoading: isUserLoading, refetch: refetchUser } = useGetIdentity();
  const webfinger = useWebfinger();
  const location = useLocation();
  const dataProvider = useDataProvider();

  const isGroup = location.pathname.startsWith('/group/');
  const webfingerId = isGroup ? location.pathname.split('/')[2] : undefined;

  useEffect(() => {
    if (isGroup) {
      setIsGroupLoading(true);
      webfinger
        .fetch(webfingerId)
        .then(groupUri => dataProvider.getOne('Actor', { id: groupUri }))
        .then(({ data }) => {
          setGroupData({
            id: data.id,
            fullName: data['foaf:name'] || data['pair:label'],
            avatar: data.image || data.icon,
            webfingerId,
            webIdData: data
          });
          setIsGroupLoading(false);
        });
    }
  }, [isGroup, webfingerId, webfinger.fetch, dataProvider, setGroupData]);

  const refetchGroup = useCallback(async () => {
    await dataProvider.getOne('Actor', { id: groupData.id });
  }, [groupData]);

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
