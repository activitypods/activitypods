import { useCallback } from 'react';
import LinkHeader from 'http-link-header';
import { useDataProvider } from 'react-admin';

/**
 * Return a function that look if an app (clientId) is registered with an user (webId)
 * If not, it redirects to the endpoint provided by the user's authorization agent
 * See https://solid.github.io/data-interoperability-panel/specification/#authorization-agent
 */
const useRegisterApp = () => {
  const dataProvider = useDataProvider();

  const registerApp = useCallback(
    async (clientId: string, webId: string): Promise<string | void> => {
      const { json: actor } = await dataProvider.fetch(webId);
      const authAgentUri = actor['interop:hasAuthorizationAgent'];

      if (authAgentUri) {
        // Find if an application registration is linked to this user
        // See https://solid.github.io/data-interoperability-panel/specification/#agent-registration-discovery
        const { headers, json: authAgent } = await dataProvider.fetch(authAgentUri);
        const linkHeader = LinkHeader.parse(headers.get('Link'));
        const registeredAgentLinkHeader = linkHeader.rel('http://www.w3.org/ns/solid/interop#registeredAgent');

        if (registeredAgentLinkHeader.length > 0) {
          const appRegistrationUri = registeredAgentLinkHeader[0].anchor;
          return appRegistrationUri;
        } else {
          // Save current path, so that the BackgroundChecks component may redirect there after registration
          localStorage.setItem('redirect', window.location.pathname);

          // No application registration found, redirect to the authorization agent
          const redirectToAuthAgentUrl = new URL(authAgent['interop:hasAuthorizationRedirectEndpoint']);
          redirectToAuthAgentUrl.searchParams.append('client_id', clientId);
          window.location.href = redirectToAuthAgentUrl.toString();
        }
      } else {
        throw new Error(`apods.error.user_authorization_agent_not_found`);
      }
    },
    [dataProvider]
  );

  return registerApp;
};

export default useRegisterApp;
