export type WebhookChannel = {
  id: string;
  topic: string;
  sendTo: string;
  webId: string;
};

export type AppStatus = {
  onlineBackend: boolean;
  installed?: boolean;
  upgradeNeeded?: boolean;
  webhookChannels: WebhookChannel[];
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

export type SolidOIDCToken = {
  azp: string;
  sub: string;
  webid: string;
  at_hash: string;
  aud: string;
  exp: number;
  iat: number;
  iss: string;
};
