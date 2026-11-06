import { readFile, writeFile } from 'node:fs/promises';

export const MANIFEST_FILE = 'app-manifest.json';

export const SPECIAL_RIGHTS = {
  'apods:ReadInbox': { en: 'Read my inbox', fr: 'Lire ma boîte de réception' },
  'apods:ReadOutbox': { en: 'Read my outbox', fr: "Lire ma boîte d'envoi" },
  'apods:PostOutbox': { en: 'Post in my outbox', fr: "Poster dans ma boîte d'envoi" },
  'apods:QuerySparqlEndpoint': { en: 'Search on my data', fr: 'Rechercher mes données' },
  'apods:CreateWacGroup': {
    en: 'Create and manage permissions groups',
    fr: 'Créer et gérer des groupes de permissions'
  },
  'apods:CreateCollection': { en: 'Create and manage collections', fr: 'Créer et gérer des collections' },
  'apods:UpdateWebId': { en: 'Update my identity (WebId)', fr: 'Modifier mon identité (WebId)' }
};

export type SpecialRight = keyof typeof SPECIAL_RIGHTS;

export const ACCESS_MODES = ['acl:Read', 'acl:Write', 'acl:Append', 'acl:Control'];

export interface ShapeTreeNeed {
  shapeTreeUri: string;
  accessMode: string | string[];
  preferredScope?: string;
}

export type AccessNeed = ShapeTreeNeed | SpecialRight;

export type Necessity = 'required' | 'optional';

export interface AppManifest {
  $schema?: string;
  name: string;
  description: string | Record<string, string>;
  author?: string;
  thumbnail?: string;
  tosUri?: string;
  supportedLocales?: string[];
  accessNeeds: Partial<Record<Necessity, AccessNeed[]>>;
}

export const isSpecialRight = (need: AccessNeed): need is SpecialRight => typeof need === 'string';

export const needKey = (need: AccessNeed) => (isSpecialRight(need) ? need : need.shapeTreeUri);

const validate = (manifest: any): string[] => {
  const errors = [];
  if (typeof manifest?.name !== 'string' || !manifest.name) errors.push('"name" must be a non-empty string');
  if (!manifest?.description) errors.push('"description" is missing');
  for (const necessity of ['required', 'optional']) {
    for (const need of manifest?.accessNeeds?.[necessity] ?? []) {
      if (typeof need === 'string') {
        if (!(need in SPECIAL_RIGHTS)) errors.push(`Unknown special right ${need}`);
      } else {
        if (!URL.canParse(need?.shapeTreeUri)) errors.push(`Invalid shapeTreeUri: ${need?.shapeTreeUri}`);
        const modes = [need?.accessMode].flat();
        if (!modes.length || !modes.every(mode => ACCESS_MODES.includes(mode))) {
          errors.push(`Invalid accessMode for ${need?.shapeTreeUri}`);
        }
      }
    }
  }
  return errors;
};

export const parseManifest = (json: string): AppManifest => {
  const manifest = JSON.parse(json);
  const errors = validate(manifest);
  if (errors.length) throw new Error(`Invalid ${MANIFEST_FILE}:\n- ${errors.join('\n- ')}`);
  return { ...manifest, accessNeeds: manifest.accessNeeds ?? {} };
};

export const readManifest = async (path: string = MANIFEST_FILE) => {
  let json;
  try {
    json = await readFile(path, 'utf8');
  } catch (e: any) {
    if (e.code === 'ENOENT') throw new Error(`${path} not found. Run "npx @activitypods/app-manifest init" first.`);
    throw e;
  }
  return parseManifest(json);
};

export const writeManifest = async (manifest: AppManifest, path: string = MANIFEST_FILE) => {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
};

export const addNeed = (manifest: AppManifest, need: AccessNeed, necessity: Necessity) => {
  const cleaned = removeNeed(manifest, needKey(need));
  return {
    ...cleaned,
    accessNeeds: { ...cleaned.accessNeeds, [necessity]: [...(cleaned.accessNeeds[necessity] ?? []), need] }
  };
};

export const removeNeed = (manifest: AppManifest, key: string): AppManifest => ({
  ...manifest,
  accessNeeds: Object.fromEntries(
    Object.entries(manifest.accessNeeds).map(([necessity, needs]) => [
      necessity,
      needs.filter(need => needKey(need) !== key)
    ])
  )
});
