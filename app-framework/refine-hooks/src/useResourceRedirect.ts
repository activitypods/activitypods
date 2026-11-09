import { useEffect } from 'react';
import { useGo, useNavigation, useParsed } from '@refinedev/core';
import {
  DEFAULT_CONTEXT,
  expandTypes,
  resolveResourceTypes,
  type JsonContext,
  type ResourcesConfig
} from '@activitypods/refine-providers';

const findResource = async (type: string, resources: ResourcesConfig, jsonContext: JsonContext) => {
  const [fullType] = await expandTypes([type], jsonContext).catch(() => [type]);
  for (const [name, config] of Object.entries(resources)) {
    const types = await resolveResourceTypes(config, jsonContext).catch(() => [] as string[]);
    if (types.includes(fullType)) return name;
  }
};

/**
 * Handle links from the Pod provider's data browser (`?type=...&uri=...&mode=show`): redirect to
 * the matching resource's page, or to the homepage if the type is not handled by the app.
 */
const useResourceRedirect = ({
  resources,
  jsonContext = DEFAULT_CONTEXT
}: {
  resources: ResourcesConfig;
  jsonContext?: JsonContext;
}) => {
  const { params } = useParsed<{ type?: string; uri?: string; mode?: string }>();
  const { list, show, edit } = useNavigation();
  const go = useGo();
  const { type, uri, mode } = params ?? {};

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resource = type ? await findResource(type, resources, jsonContext) : undefined;
      if (cancelled) return;
      if (resource && uri) {
        (mode === 'edit' ? edit : show)(resource, uri, 'replace');
      } else if (resource) {
        list(resource, 'replace');
      } else {
        go({ to: '/', type: 'replace' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, uri, mode]);
};

export default useResourceRedirect;
