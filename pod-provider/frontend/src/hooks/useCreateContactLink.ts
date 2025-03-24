import { useState, useCallback, useMemo } from 'react';
import { useGetIdentity, useDataProvider, useNotify } from 'react-admin';
import urlJoin from 'url-join';
import { FetchFn, SemanticDataProvider } from '@semapps/semantic-data-provider';
import copy from 'copy-to-clipboard';

const VC_API_PATH = '/vc/v0.3';

/** Creates a VC capability that's usable as an invite link. This returns the capability's URI, not the URI that the invitee can open in the frontend! */
const requestContactCapability = async (fetchFn: FetchFn, webIdDoc: any, profileDoc: any) => {
  const vcEndpointUri = urlJoin(webIdDoc?.id, VC_API_PATH);

  const result = await fetchFn(urlJoin(vcEndpointUri, 'credentials/issue'), {
    method: 'POST',
    body: JSON.stringify({
      credential: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          {
            as: 'https://www.w3.org/ns/activitystreams#',
            apods: 'http://activitypods.org/ns/core#',
            acl: 'http://www.w3.org/ns/auth/acl#'
          }
        ],
        type: 'VerifiableCredential',
        name: 'Invite Link',
        credentialSubject: {
          'apods:hasActivityGrant': {
            type: 'as:Offer',
            'as:target': webIdDoc.id,
            'as:object': {
              type: 'as:Add',
              'as:object': {
                type: 'as:Profile'
              }
            }
          },
          'apods:hasAuthorization': {
            type: 'acl:Authorization',
            'acl:mode': 'acl:Read',
            'acl:accessTo': [].concat(profileDoc.id, profileDoc['vcard:photo'] || [])
          }
        }
      }
    })
  }).catch(err => {
    throw new Error('Creating invite link capability failed. An error occurred while requesting the VC endpoint.', {
      cause: err
    });
  });

  const verifiableCredential = result.json;
  const link = verifiableCredential?.id;

  if (link && result.status >= 200 && result.status < 300) {
    return link;
  } else {
    throw new Error('Creating invite link capability failed. The VC endpoint returned an invalid response', {
      cause: result
    });
  }
};

const useCreateContactLink = (
  { shouldCopy, shouldNotify }: { shouldCopy: boolean; shouldNotify: boolean | 'onError' } = {
    shouldCopy: false,
    shouldNotify: false
  }
) => {
  // Profile and WebId documents
  const { data: identity } = useGetIdentity();
  const notify = useNotify();
  const webIdDoc = identity?.webIdData;
  const profileData = identity?.profileData;

  const dataProvider = useDataProvider<SemanticDataProvider>();

  // States
  const [status, setStatus] = useState<'ready' | 'loading' | 'success' | 'error'>('ready');
  const [link, setLink] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<undefined | object>(undefined);
  const [copied, setCopied] = useState(false);

  // Callback to trigger link creation.
  const createLink = useCallback(() => {
    if (status === 'loading') return Promise.reject('A link is already being created.');
    if (!webIdDoc || !profileData) return Promise.reject('WebId or profile data is not loaded yet.');

    setStatus('loading');
    setLink(null);
    setErrorDetails(undefined);
    setCopied(false);

    // Do the call.
    return requestContactCapability(dataProvider.fetch, webIdDoc, profileData)
      .then(capabilityUri => {
        // Create the link that invitees can open in the frontend.
        const inviteLink = `${new URL(window.location.href).origin}/invite/${encodeURIComponent(capabilityUri)}`;

        setStatus('success');
        setLink(inviteLink);
        setErrorDetails(undefined);

        // Copy to clipboard.
        if (shouldCopy) {
          const copied = copy(inviteLink);
          setCopied(true);
          // Notify about success/failure.
          if (shouldNotify === true) {
            if (copied) notify('app.notification.contact_link_copied', { type: 'success' });
            else
              notify('app.notification.contact_link_copying_failed', {
                type: 'warning',
                messageArgs: { link: inviteLink },
                multiLine: true,
                autoHideDuration: 15_000
              });
          }
        }

        return inviteLink;
      })
      .catch(error => {
        setStatus('error');
        setLink(null);
        setErrorDetails(error);

        if (shouldNotify !== false)
          notify('app.notification.contact_link_creation_failed', {
            type: 'error',
            messageArgs: { error },
            multiLine: true
          });

        // Throw again so that the promise fails and can be caught again.
        // throw error;
      });
  }, [setStatus, setLink, setErrorDetails, webIdDoc, profileData]);

  return useMemo(() => ({ createLink, status, link, errorDetails, copied }), [createLink, status, link, errorDetails]);
};

export default useCreateContactLink;
