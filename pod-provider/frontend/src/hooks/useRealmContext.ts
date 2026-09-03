import { useContext } from 'react';
import RealmContext from '../contexts/RealmContext';

const useRealmContext = () => {
  return useContext(RealmContext);
};

export default useRealmContext;
