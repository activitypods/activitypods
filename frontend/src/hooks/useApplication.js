import { useNodeinfo } from '@semapps/activitypub-components';

const useApplication = appDomain => {
  const application = useNodeinfo(appDomain, 'https://www.w3.org/ns/activitystreams#Application');
  return application;
};

export default useApplication;
