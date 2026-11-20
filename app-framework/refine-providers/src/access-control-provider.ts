import type { AccessControlProvider } from '@refinedev/core';
import { storagesResolver } from './storages';
import { DEFAULT_CONTEXT, findContainerUri, resolveResourceTypes } from './utils';
import {
  canShareContainer,
  canShareResource,
  canWriteContainer,
  canWriteResource,
  getGroupSpecialRights
} from './grants';
import { DataProviderConfig } from './types';

const CONTROLLED_ACTIONS = ['create', 'edit', 'delete', 'clone', 'share'];

/**
 * Refine access control provider for ActivityPods, to be given the same config as the data provider.
 * Reading is always allowed, as the Pod decides what is returned. Writing is allowed if the access grants
 * of the app, given by the logged-in user, include `acl:Write` on the container (`create`, `clone`)
 * or on the resource (`edit`, `delete`). Managing the access (`share`, on a resource with `params.id`,
 * otherwise on the container where the resource is created) is allowed to the owner of the data, and to
 * the grantees allowed to delegate it.
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
      if (!CONTROLLED_ACTIONS.includes(action)) return { can: true };
      const session = authProvider.getSession();
      if (!session) return { can: false, reason: 'Not authenticated' };

      if (action === 'share' && params?.id) {
        return { can: await canShareResource(`${params.id}`, session) };
      }

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
      if (!containerUri) return { can: false };
      if (action === 'share') {
        // Only the admins of a group may change the access to all the data of a type, the others share them one by one
        if (storageUri !== session.webId) {
          return { can: (await getGroupSpecialRights(storageUri, session)).includes('interop:ManageAccess') };
        }
        return { can: await canShareContainer(containerUri, session) };
      }
      return { can: await canWriteContainer(containerUri, session, [storageUri]) };
    },
    options: {
      buttons: { enableAccessControl: true, hideIfUnauthorized: true }
    }
  };
};

export default accessControlProvider;
