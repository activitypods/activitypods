import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslate, useGetIdentity, useGetList, useDataProvider } from 'react-admin';
import urlJoin from 'url-join';
import { arrayOf } from '../utils';
import { FetchFn, SemanticDataProvider } from '@semapps/semantic-data-provider';
import { ACTIVITY_TYPES, OBJECT_TYPES } from '@semapps/activitypub-components';

// useState(translate('ra.page.loading'));
const VC_API_SERVICE_TYPE = 'urn:tmp:vcService';

/** Creates a VC capability that's usable as an invite link. This returns the capability's URI, not the URI that the invitee can open in the frontend! */
const requestContactCapability = async (fetchFn: FetchFn, webIdDoc: any, profileDoc: any) => {
  const vcEndpointUri: string | undefined = arrayOf(webIdDoc?.service).find(
    service => service.type === VC_API_SERVICE_TYPE
  )?.serviceEndpoint;

  if (!vcEndpointUri) {
    throw new Error('Creating invite link capability failed. No VC API endpoint is available.');
  }

  const result = await fetchFn(urlJoin(vcEndpointUri, 'credentials/issue'), {
    method: 'POST',
    body: JSON.stringify({
      credential: {
        name: 'Invite Link',
        credentialSubject: {
          hasActivityGrant: {
            type: ACTIVITY_TYPES.OFFER,
            target: webIdDoc.id,
            object: {
              type: ACTIVITY_TYPES.ADD,
              object: {
                type: OBJECT_TYPES.PROFILE
              }
            }
          },
          hasAuthorization: {
            type: 'acl:Authorization',
            'acl:mode': 'acl:Read',
            'acl:accessTo': [profileDoc.id, profileDoc['vcard:photo']]
          }
        }
      }
    })
  }).catch(err => {
    throw new Error('Creating invite link capability failed. An error occurred while requesting the VC endpoint.', {
      cause: err
    });
  });

  const verifiableCredential = await result.json;
  const link = verifiableCredential?.id;

  if (link && result.status >= 200 && result.status < 300) {
    return link;
  } else {
    throw new Error('Creating invite link capability failed. The VC endpoint returned an invalid response', {
      cause: result
    });
  }
};

const useCreateContactLink = () => {
  // Profile and WebId documents
  const { data: identity } = useGetIdentity();
  const webIdDoc = identity?.webIdData;
  const profileData = identity?.profileData;

  const dataProvider = useDataProvider<SemanticDataProvider>();

  // States
  const [status, setStatus] = useState<'ready' | 'loading' | 'success' | 'error'>('ready');
  const [link, setLink] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<undefined | object>(undefined);

  // Callback to trigger link creation.
  const createLink = useCallback(() => {
    if (status === 'loading') return;
    if (!webIdDoc || !profileData) return;

    setStatus('loading');
    setLink(null);
    setErrorDetails(undefined);

    requestContactCapability(dataProvider.fetch, webIdDoc, profileData)
      .then(capabilityUri => {
        // Create the link that invitees can open in the frontend.
        const inviteLInk = `${new URL(window.location.href).origin}/invite/${encodeURIComponent(capabilityUri)}`;

        setStatus('success');
        setLink(inviteLInk);
        setErrorDetails(undefined);
      })
      .catch(error => {
        setStatus('error');
        setLink(null);
        setErrorDetails(error);
      });
  }, [setStatus, setLink, setErrorDetails, webIdDoc, profileData]);

  return useMemo(() => ({ createLink, status, link, errorDetails }), [createLink, status, link, errorDetails]);
};

export default useCreateContactLink;
