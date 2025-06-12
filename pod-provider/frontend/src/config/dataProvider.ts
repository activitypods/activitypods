import urlJoin from 'url-join';
import {
  dataProvider,
  configureUserStorage,
  fetchDataRegistry,
  fetchTypeIndexes
} from '@semapps/semantic-data-provider';
import dataServers from './dataServers';
import * as resources from '../resources';

export default dataProvider({
  dataServers,
  resources: Object.fromEntries(Object.entries(resources).map(([k, v]) => [k, v.dataModel])),
  jsonContext: ['https://www.w3.org/ns/activitystreams', urlJoin(CONFIG.BACKEND_URL, '/.well-known/context.jsonld')],
  returnFailedResources: true,
  plugins: [configureUserStorage(), fetchDataRegistry(), fetchTypeIndexes()]
});
