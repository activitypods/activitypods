export const DEFAULT_REPOSITORY = 'https://shapes.activitypods.org';

export interface CatalogShape {
  uri: string;
  label: Record<string, string>;
  definition?: Record<string, string>;
  usage: number;
}

const fetchJson = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as any;
};

export const shortName = (uri: string) => uri.split('/shapetrees/')[1] ?? uri;

export const localized = (values: Record<string, string> | undefined, locale: string) =>
  values?.[locale] ?? values?.en ?? '';

export const fetchCatalog = async (repository: string): Promise<CatalogShape[]> => {
  const base = repository.replace(/\/+$/, '');
  const { shapes } = await fetchJson(`${base}/api/shapes`);

  const usage: Record<string, number> = {};
  try {
    const { applications } = await fetchJson(`${base}/api/applications`);
    for (const application of applications) {
      for (const uri of new Set<string>(application.needs.map((need: any) => need.shapeTree))) {
        usage[uri] = (usage[uri] ?? 0) + 1;
      }
    }
  } catch {
    // The usage only helps to sort the shapes
  }

  return shapes
    .map((shape: any) => ({
      uri: shape.uri,
      label: shape.label,
      definition: shape.definition,
      usage: usage[shape.uri] ?? 0
    }))
    .sort((a: CatalogShape, b: CatalogShape) => b.usage - a.usage || a.uri.localeCompare(b.uri));
};

export const isShapeTree = async (uri: string) => {
  try {
    const response = await fetch(uri, { headers: { Accept: 'text/turtle' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return false;
    const turtle = await response.text();
    return turtle.includes('st:ShapeTree') || turtle.includes('http://www.w3.org/ns/shapetrees#ShapeTree');
  } catch {
    return false;
  }
};
