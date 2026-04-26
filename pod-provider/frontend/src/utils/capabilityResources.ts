type JsonLdResourceRef = string | { id?: unknown; '@id'?: unknown } | null | undefined;

type CapabilityAuthorization = {
  'acl:accessTo'?: JsonLdResourceRef | JsonLdResourceRef[];
};

type CapabilityWithAuthorizations = {
  credentialSubject?: {
    'apods:hasAuthorization'?: CapabilityAuthorization | CapabilityAuthorization[];
  };
};

const arrayOf = <T>(value: T | T[] | null | undefined): T[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const getResourceUri = (resource: JsonLdResourceRef): string | undefined => {
  if (typeof resource === 'string') return resource;
  if (!resource || typeof resource !== 'object') return undefined;

  const uri = resource.id || resource['@id'];
  return typeof uri === 'string' ? uri : undefined;
};

export const normalizeCapabilityResourceUris = (capability: CapabilityWithAuthorizations): string[] => {
  return arrayOf(capability?.credentialSubject?.['apods:hasAuthorization'])
    .flatMap(authorization => arrayOf(authorization?.['acl:accessTo']))
    .map(getResourceUri)
    .filter((uri): uri is string => typeof uri === 'string');
};
