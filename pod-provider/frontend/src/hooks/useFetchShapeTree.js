import { useCallback } from 'react';
import { fetchUtils } from 'react-admin';
import jsonld from 'jsonld';

/**
 * Return a fetchShapeTree function, that takes a shape tree URI as an argument
 * and returns the compacted shape tree, as well as the class associated with the shape
 */
const useFetchShapeTree = () => {
  const fetchShapeTree = useCallback(async shapeTreeUri => {
    const { json } = await fetchUtils.fetchJson(shapeTreeUri, {
      headers: new Headers({ Accept: 'application/ld+json' })
    });

    const shapeTree = await jsonld.compact(json, {
      st: 'http://www.w3.org/ns/shapetrees#',
      skos: 'http://www.w3.org/2004/02/skos/core#',
      expectsType: { '@id': 'st:expectsType', '@type': '@id' },
      shape: { '@id': 'st:shape', '@type': '@id' },
      describesInstance: { '@id': 'st:describesInstance', '@type': '@id' },
      label: { '@id': 'skos:prefLabel', '@container': '@language' }
    });

    if (shapeTree.shape) {
      const { json: shape } = await fetchUtils.fetchJson(shapeTree.shape, {
        headers: new Headers({ Accept: 'application/ld+json' })
      });

      const [type] = shape?.[0]?.['http://www.w3.org/ns/shacl#targetClass']?.map(node => node?.['@id']);

      return { ...shapeTree, type };
    } else {
      return shapeTree;
    }
  }, []);

  return fetchShapeTree;
};

export default useFetchShapeTree;
