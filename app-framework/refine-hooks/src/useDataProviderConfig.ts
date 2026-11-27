import { useDataProvider } from '@refinedev/core';
import type { ActivityPodsDataProvider } from '@activitypods/refine-providers';

/** The config given to the data provider of `@activitypods/refine-providers` */
const useDataProviderConfig = () => {
  const dataProvider = useDataProvider()() as Partial<ActivityPodsDataProvider>;
  if (!dataProvider.getConfig) {
    throw new Error('Refine must be given a dataProvider created with @activitypods/refine-providers');
  }
  return dataProvider.getConfig();
};

export default useDataProviderConfig;
