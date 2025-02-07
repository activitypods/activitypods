import { useCallback } from 'react';
import { fetchUtils } from 'react-admin';
import jsonld from 'jsonld';
import ShexParser from '@shexjs/parser';

/**
 * Return a fetchShapeTree function, that takes a shape tree URI as an argument
 * and returns the compacted shape tree, as well as the class associated with the shape
 */
const useFetchShapeTree = () => {
  const shexParser = ShexParser.construct();

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

    const response = await fetch(shapeTree.shape, { headers: { Accept: '*/*' } }); // TODO use text/shex
    if (!response.ok) return false;

    const shexC = await response.text();
    const shexJ = shexParser.parse(shexC);

    const type = shexJ?.shapes?.[0]?.shapeExpr?.expression?.expressions.find(
      expr => expr.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    )?.valueExpr?.values?.[0];

    return { ...shapeTree, type };
  }, []);

  return fetchShapeTree;
};

export default useFetchShapeTree;
