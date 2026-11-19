import type { AccessControlProvider } from '@refinedev/core';
import { storagesResolver } from './storages';
import { DEFAULT_CONTEXT, findContainerUri, resolveResourceTypes } from './utils';
import { canWriteContainer, canWriteResource } from './grants';
import { DataProviderConfig } from './types';

const WRITE_ACTIONS = ['create', 'edit', 'delete', 'clone'];

/**
 * Refine access control provider for ActivityPods, to be given the same config as the data provider.
 * Reading is always allowed, as the Pod decides what is returned. Writing is allowed if the access grants
 * of the app, given by the logged-in user, include `acl:Write` on the container (`create`, `clone`)
 * or on the resource (`edit`, `delete`).
 */
const accessControlProvider = ({
  resources,
  storages = {},
  authProvider,
  jsonContext = DEFAULT_CONTEXT
}: DataProviderConfig): AccessControlProvider => {
  const { getStorageUri } = storagesResolver({ resources, storages, jsonContext });

  return {
    can: async ({ resource, action, params }) => {
      if (!WRITE_ACTIONS.includes(action)) return { can: true };
      const session = authProvider.getSession();
      if (!session) return { can: false, reason: 'Not authenticated' };

      if (action === 'edit' || action === 'delete') {
        const storageUris = [session.webId, ...Object.values(storages).map(({ uri }) => uri)];
        return { can: !!params?.id && (await canWriteResource(`${params.id}`, session, storageUris)) };
      }

      const resourceConfig = resource ? resources[resource] : undefined;
      const storageKey = resourceConfig?.create?.storage ?? '@user';
      if (!resourceConfig || storageKey === '@all' || storageKey === '@shared') return { can: false };
      const storageUri = getStorageUri(storageKey, session)!;
      const types = await resolveResourceTypes(resourceConfig, jsonContext);
      const containerUri = await findContainerUri(storageUri, resourceConfig, types, session);
      return { can: !!containerUri && (await canWriteContainer(containerUri, session, [storageUri])) };
    },
    options: {
      buttons: { enableAccessControl: true, hideIfUnauthorized: true }
    }
  };
};

export default accessControlProvider;
