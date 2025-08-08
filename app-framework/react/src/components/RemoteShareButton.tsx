import React, { useState, useEffect, useCallback, FunctionComponent } from 'react';
import { useGetIdentity, Button, useDataProvider, useRecordContext, ButtonProps } from 'react-admin';
import ShareIcon from '@mui/icons-material/Share';

// Share by redirecting to the user's Authorization Agent
// To open a modal inside the app, use the ShareButton instead
const RemoteShareButton: FunctionComponent<Props> = ({ clientId, ...rest }) => {
  const dataProvider = useDataProvider();
  const record = useRecordContext();
  const { data: identity, isLoading } = useGetIdentity();
  const [authAgent, setAuthAgent] = useState();
  const [isAuthAgentLoading, setIsAuthAgentLoading] = useState(false);

  useEffect(() => {
    if (!isAuthAgentLoading && !authAgent && record?.['dc:creator'] === identity?.id) {
      const authAgentUri = identity?.webIdData?.['interop:hasAuthorizationAgent'];
      if (authAgentUri) {
        setIsAuthAgentLoading(true);
        dataProvider.fetch(authAgentUri).then(({ json }: { json: any }) => {
          setAuthAgent(json);
          setIsAuthAgentLoading(false);
        });
      }
    }
  }, [identity, record, dataProvider, authAgent, setAuthAgent, isAuthAgentLoading, setIsAuthAgentLoading]);

  const onClick = useCallback(() => {
    // Save current path, so that the BackgroundChecks component may redirect there after registration
    localStorage.setItem('redirect', window.location.pathname);

    const redirectUrl = new URL(authAgent?.['interop:hasAuthorizationRedirectEndpoint']!);
    redirectUrl.searchParams.append('client_id', clientId);
    redirectUrl.searchParams.append('resource', record?.id as string);

    window.location.href = redirectUrl.toString();
  }, [authAgent, clientId, record]);

  if (isLoading || isAuthAgentLoading || !authAgent || !record || record?.['dc:creator'] !== identity?.id) return null;

  return <Button onClick={onClick} startIcon={<ShareIcon />} label="apods.action.share" {...rest} />;
};

type Props = Partial<ButtonProps> & {
  clientId: string;
};

export default RemoteShareButton;
