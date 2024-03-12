import { useGetList } from 'react-admin';

const DataPage = () => {
  const { data: classDescriptions } = useGetList('ClassDescription');

  const { data: appRegistrations } = useGetList('AppRegistration');

  console.log('data', classDescriptions, appRegistrations);

  return null;
};

export default DataPage;
