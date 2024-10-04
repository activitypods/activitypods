import { useEffect, useState } from 'react';
import urlJoin from 'url-join';
import jsonld from 'jsonld';
import { useDataProvider, useGetIdentity } from 'react-admin';

const useResourcesByType = (containerUri, typeRegistration) => {
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
            expandedTypeRegistration?.['http://activitypods.org/ns/core#labelPredicate']?.[0]?.['@id'];

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
