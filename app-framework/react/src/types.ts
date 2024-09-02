export type AppStatus = {
  onlineBackend: boolean;
  installed?: boolean;
  upgradeNeeded?: boolean;
};

export type Ontology = {
  prefix: string;
  owl?: string;
  url: string;
};

export type PodProvider = {
  id?: string;
  type?: string;
  'apods:baseUrl': string;
  'apods:area'?: string;
  'apods:locales'?: string;
  'apods:providedBy'?: string;
};
