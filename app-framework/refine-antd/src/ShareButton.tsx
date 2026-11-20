import { useState } from 'react';
import { useCan, useTranslate } from '@refinedev/core';
import { resolveAuthAgent, STORAGE_KEY_REDIRECT } from '@activitypods/refine-providers';
import { useAuthProvider } from '@activitypods/refine-hooks';
import { Button, type ButtonProps } from 'antd';
import { ShareAltOutlined } from '@ant-design/icons';

export type ShareButtonProps = Omit<ButtonProps, 'onClick'> & {
  /** The client ID of the app, shown on the share screen */
  clientId: string;
  /** Resource of the data provider, used by the access control provider */
  resource?: string;
  /** URI of the resource to share. Without it, all the resources of `shapeTreeUri` in `podOwner` are shared */
  recordItemId?: string;
  shapeTreeUri?: string;
  /** WebID of the owner of the data (e.g. a group). Defaults to the logged-in user */
  podOwner?: string;
};

/**
 * Open the share screen of the user's Pod provider, to choose who can access a resource, or all the resources
 * of a type. Shown only if the access control provider allows the `share` action.
 */
const ShareButton = ({
  clientId,
  resource,
  recordItemId,
  shapeTreeUri,
  podOwner,
  children,
  ...props
}: ShareButtonProps) => {
  const translate = useTranslate();
  const authProvider = useAuthProvider();
  const [loading, setLoading] = useState(false);
  const { data: canShare } = useCan({ resource, action: 'share', params: { id: recordItemId } });

  if (!canShare?.can) return null;

  const share = async () => {
    setLoading(true);
    try {
      const session = authProvider.getSession()!;
      const { authAgent } = await resolveAuthAgent(session.webId, session.token);
      const url = new URL(authAgent['interop:hasAuthorizationRedirectEndpoint']);
      url.searchParams.set('client_id', clientId);
      if (recordItemId) {
        url.searchParams.set('resource', recordItemId);
      } else if (shapeTreeUri) {
        url.searchParams.set('shapeTree', shapeTreeUri);
        url.searchParams.set('podOwner', podOwner || session.webId);
      }
      // To come back to the current page once the access is changed
      localStorage.setItem(STORAGE_KEY_REDIRECT, window.location.pathname + window.location.search);
      window.location.href = url.toString();
    } catch (e) {
      setLoading(false);
      throw e;
    }
  };

  return (
    <Button icon={<ShareAltOutlined />} loading={loading} onClick={share} {...props}>
      {children ?? translate('buttons.share', 'Share')}
    </Button>
  );
};

export default ShareButton;
