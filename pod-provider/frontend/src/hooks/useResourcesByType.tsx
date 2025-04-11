import { useEffect, useState } from 'react';
import urlJoin from 'url-join';
import jsonld from 'jsonld';
import { useDataProvider, useGetIdentity } from 'react-admin';

const useResourcesByType = (containerUri: any, typeRegistration: any) => {
  const { data: identity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (containerUri && typeRegistration && identity?.id) {
        try {
          const [expandedTypeRegistration] = await jsonld.expand(typeRegistration);
          const expandedLabelPredicate =
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            expandedTypeRegistration?.['http://activitypods.org/ns/core#labelPredicate']?.[0]?.['@id'];

          // @ts-expect-error TS(2345): Argument of type 'Identifier' is not assignable to... Remove this comment to see the full error message
          const { json } = await dataProvider.fetch(urlJoin(identity.id, 'sparql'), {
            method: 'POST',
            body: `
              PREFIX ldp: <http://www.w3.org/ns/ldp#>
              PREFIX dc: <http://purl.org/dc/terms/>
              SELECT ?resourceUri ?label ?creator ?created ?modified
              WHERE {
                <${containerUri}> ldp:contains ?resourceUri .
                OPTIONAL {
                  ${expandedLabelPredicate ? `?resourceUri <${expandedLabelPredicate}> ?label . ` : ''}
                  ?resourceUri dc:creator ?creator .
                  ?resourceUri dc:created ?created .
                  ?resourceUri dc:modified ?modified .
                }
              }
            `
          });

          setResources(json);
          setIsLoading(false);
          setIsLoaded(true);
        } catch (e) {
          console.error(e);
          setIsLoading(false);
        }
      }
    })();
  }, [containerUri, typeRegistration, identity, dataProvider, setResources, setIsLoading, setIsLoaded]);

  return { resources, isLoading, isLoaded };
};

export default useResourcesByType;
