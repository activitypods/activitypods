import { dataProvider as semanticDataProvider, httpClient } from '@semapps/semantic-data-provider';
import ontologies from './ontologies.json';
import dataServers from './dataServers';
import * as resources from '../resources';

const dataProvider = semanticDataProvider({
  dataServers,
  httpClient,
  resources: Object.fromEntries(Object.entries(resources).map(([k, v]) => [k, v.dataModel])),
  ontologies,
  jsonContext: 'https://data.bienvenuechezmoi.org/context.json',
  returnFailedResources: true,
});

export default dataProvider;
