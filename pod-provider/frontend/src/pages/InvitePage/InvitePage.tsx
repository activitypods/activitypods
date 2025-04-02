import React, { useDataProvider, useGetIdentity, useNotify, useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ACTIVITY_TYPES, OBJECT_TYPES, useOutbox } from '@semapps/activitypub-components';
import { Box, CircularProgress } from '@mui/material';
import InvitePageViewLoggedOut from './InvitePageViewLoggedOut';
import InvitePageViewLoggedIn from './InvitePageViewLoggedIn';
import InvitePageSuccess from './InvitePageSuccess';
import InvitePageProviderSelect from './InvitePageProviderSelect';
import SimpleBox from '../../layout/SimpleBox';
import { arrayOf, createPresentation, fetchCapabilityResources } from '../../utils';
import { SemanticDataProvider } from '@semapps/semantic-data-provider';

/** The URI is expected to be encoded in the URI fragment in the SearchParams format. */
const getCapabilityUri = (location: Location) => {
  try {
    const capUriEncoded = /invite\/(.+)$/.exec(location.pathname)?.[1] || '';
    return decodeURIComponent(capUriEncoded);
  } catch (e) {
    return undefined;
  }
};

/**
 * Renders the main component that navigates through the invite workflow.
 */
const InvitePage = () => {
  const navigate = useNavigate();
  const translate = useTranslate();
  const capabilityUri = getCapabilityUri(window.location)!;
  const { fetch: fetchFn, getConfig } = useDataProvider<SemanticDataProvider>();

  const [showSuccess, setShowSuccess] = useState(false);
  const [showProviderSelect, setShowProviderSelect] = useState(false as false | 'login' | 'signup');
  const [inviterProfile, setInviterProfile] = useState(null as null | Record<string, unknown>);
  const notify = useNotify();
  const { data: identity } = useGetIdentity();
  const ownProfile = identity?.profileData;

  const outbox = useOutbox();

  // Fetch the inviter profile and photo..
  useEffect(() => {
    if (!capabilityUri) {
      notify('app.notification.invite_cap_invalid', {
        type: 'error',
        multiLine: true,
        messageArgs: { error: 'No capability available' }
      });
      navigate('/');
      return;
    }

    fetchCapabilityResources(capabilityUri)
      .then(resources => {
        const imageBlob: Blob = resources.find(resource => resource.type?.includes('image/'));
        const profileDoc = resources.find(resource => arrayOf(resource.type).includes('Profile'));

        if (imageBlob && profileDoc) {
          // Set the profile image as blob URI manually. Sorry, a bit hacky.
          profileDoc['vcard:photo'] = URL.createObjectURL(imageBlob);
        }

        setInviterProfile(profileDoc);
      })
      .catch((err: Error) => {
        notify('app.notification.invite_cap_invalid', {
          type: 'error',
          messageArgs: { error: err.message },
          multiLine: true
        });
        navigate('/');
      });
  }, []);

  // There are multiple page options depending on the current state:
  // 1. Logged out => show invite page
  // 1.2 clicked on signup / login => show Provider select
  // 2. Logged in => show connect
  // 3. sent connection request => success page

  if (showProviderSelect) {
    return (
      <InvitePageProviderSelect
        isSignup={showProviderSelect === 'signup'}
        capabilityUri={capabilityUri}
        onCancel={() => {
          setShowProviderSelect(false);
        }}
      />
    );
  }
  if (showSuccess) {
    return <InvitePageSuccess inviterProfile={inviterProfile} ownProfile={ownProfile} />;
  }

  // Logged in and inviter profile fetched.
  if (identity?.id && inviterProfile) {
    const onConnectClick = async () => {
      const capability = await createPresentation({
        fetchFn,
        holder: identity.id as string,
        verifier: inviterProfile.describes as string,
        verifiableCredential: capabilityUri
      });
      outbox
        .post({
          '@context': (await getConfig()).jsonContext,
          type: ACTIVITY_TYPES.OFFER,
          actor: identity.id,
          to: inviterProfile.describes,
          target: inviterProfile.describes,
          object: {
            type: ACTIVITY_TYPES.ADD,
            object: {
              type: OBJECT_TYPES.PROFILE,
              id: inviterProfile.id
            }
          },
          capability: capability
        })
        .then(() => {
          notify('app.notification.connection_accepted');
          setShowSuccess(true);
        })
        .catch((err: Error) => {
          notify('app.notification.send_request_error', { error: err.message });
        });
    };

    return (
      <InvitePageViewLoggedIn
        inviterProfile={inviterProfile}
        ownProfile={ownProfile}
        onConnectClick={() => {
          onConnectClick();
        }}
        onCancelClick={() => {
          navigate('/');
        }}
        capabilityUri={capabilityUri}
      />
    );
  }

  // Logged out, inviter profile fetched.
  if (inviterProfile) {
    return (
      <InvitePageViewLoggedOut
        profileData={inviterProfile}
        onCreateProfileClick={() => {
          setShowProviderSelect('signup');
        }}
        onLoginClick={() => {
          setShowProviderSelect('login');
        }}
      />
    );
  }

  return (
    <SimpleBox title={translate('app.page.invite_loading')}>
      <Box display="flex" justifyContent="center">
        <CircularProgress />
      </Box>
    </SimpleBox>
  );
};

const InvitePageWrapper = (props: any) => {
  return <InvitePage {...props} />;
};

export default InvitePageWrapper;
