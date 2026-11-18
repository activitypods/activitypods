import { arrayOf, discoverSharedSources, findContainerUri, resolveResourceTypes } from './utils';
import { AuthSession, JsonContext, ResourceConfig, ResourcesConfig, StorageKey, StoragesConfig } from './types';

export type ListSources = {
  containers: { uri: string; storage: string }[];
  resources: { uri: string; storage: string }[];
};

/** Resolve the storages of the config into the containers and resources where a resource is listed */
export const storagesResolver = ({
  resources,
  storages = {},
  jsonContext,
  readAccessGrants = false
}: {
  resources: ResourcesConfig;
  storages?: StoragesConfig;
  jsonContext: JsonContext;
  readAccessGrants?: boolean;
}) => {
  const requireResourceConfig = (resource: string): ResourceConfig => {
    const resourceConfig = resources[resource];
    if (!resourceConfig) throw new Error(`Resource "${resource}" is not configured`);
    return resourceConfig;
  };

  const getStorageUri = (key: StorageKey, session?: AuthSession) => {
    if (key === '@user') return session?.webId;
    if (!storages[key]) throw new Error(`Storage "${key}" is not configured`);
    return storages[key].uri;
  };

  // Returns the URIs of the storages, and whether the shared storages are included
  const expandStorageKeys = (keys: StorageKey[], session?: AuthSession) => {
    const uris = new Set<string>();
    let shared = false;
    for (const key of keys) {
      if (key === '@all') {
        if (session) uris.add(session.webId);
        Object.values(storages).forEach(({ uri }) => uris.add(uri));
        if (readAccessGrants) shared = true;
      } else if (key === '@shared') {
        shared = true;
      } else {
        const uri = getStorageUri(key, session);
        if (uri) uris.add(uri);
      }
    }
    return { uris: [...uris], shared: shared && !!session };
  };

  const resolveListSources = async (resource: string, session?: AuthSession): Promise<ListSources> => {
    const resourceConfig = requireResourceConfig(resource);
    const types = await resolveResourceTypes(resourceConfig, jsonContext);
    if (types.length === 0) throw new Error(`Resource "${resource}" must define either \`shapeTreeUri\` or \`types\``);

    const { uris, shared } = expandStorageKeys(arrayOf(resourceConfig.list?.storages ?? '@all'), session);
    const sources: ListSources = { containers: [], resources: [] };
    const errors: unknown[] = [];

    const containerUris = await Promise.allSettled(
      uris.map(uri => findContainerUri(uri, resourceConfig, types, session))
    );
    containerUris.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.warn(`Could not read storage ${uris[i]}`, result.reason);
        errors.push(result.reason);
      } else if (result.value) {
        sources.containers.push({ uri: result.value, storage: uris[i] });
      }
    });

    if (shared) {
      const sharedSources = await discoverSharedSources(resourceConfig, types, session!).catch(() => []);
      for (const source of sharedSources) {
        if ('containerUri' in source) {
          if (!sources.containers.some(c => c.uri === source.containerUri)) {
            sources.containers.push({ uri: source.containerUri, storage: source.dataOwner });
          }
        } else {
          sources.resources.push(...source.resourceUris.map(uri => ({ uri, storage: source.dataOwner })));
        }
      }
    }

    if (sources.containers.length === 0 && sources.resources.length === 0) {
      if (errors.length > 0) throw errors[0];
      if (uris.length > 0) {
        throw new Error(
          `No container found for resource "${resource}" (type(s): ${types.join(', ')}) in ${uris.join(', ')}. ` +
            `Has the app declared this access need, and has the user granted access to it?`
        );
      }
    }
    return sources;
  };

  return { getStorageUri, resolveListSources };
};
