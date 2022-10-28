import React, { useState, useEffect } from 'react';
import { useDataProvider, ListContextProvider } from 'react-admin';

const SelectedContactsList = ({ resource, ids, children }) => {
  const dataProvider = useDataProvider();
  const [listContext, setListContext] = useState({ loading: true, loaded: false });

  useEffect(() => {
    dataProvider.getMany(resource, { ids }).then(({ data }) => {
      setListContext({
        data: Object.fromEntries(data.map((record) => [record.id, record])),
        ids: data.map((record) => record.id),
        total: data.length,
        loading: false,
        loaded: true,
        resource,
      });
    });
  }, [resource, ids, setListContext, dataProvider]);

  return <ListContextProvider value={listContext}>{children}</ListContextProvider>;
};

export default SelectedContactsList;
