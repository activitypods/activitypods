import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useNotify } from 'react-admin';
import { useOutbox, ACTIVITY_TYPES, useInbox } from '@semapps/activitypub-components';

const useUninstallApp = app => {
  const notify = useNotify();
  const outbox = useOutbox({ liveUpdates: true });
  const inbox = useInbox({ liveUpdates: true });

  const uninstallApp = useCallback(async () => {
    try {
      notify('app.notification.app_uninstallation_in_progress');

      await inbox.awaitWebSocketConnection();
      await outbox.awaitWebSocketConnection();

      // Do not await to ensure we don't miss the activities
      outbox.post({
        '@context': ['https://www.w3.org/ns/activitystreams', { apods: 'http://activitypods.org/ns/core#' }],
        type: ACTIVITY_TYPES.UNDO,
        actor: outbox.owner,
        object: {
          type: 'apods:Install',
          object: app.id
        }
      });

      // TODO Allow to pass an object, and automatically dereference it, like on the @semapps/activitypub matchActivity util
      const deleteRegistrationActivity = await outbox.awaitActivity(
        activity => activity.type === 'Delete' && activity.to === app.id,
        { timeout: 60000 }
      );

      await inbox.awaitActivity(
        activity =>
          activity.type === 'Accept' && activity.actor === app.id && activity.object === deleteRegistrationActivity.id,
        { timeout: 60000 }
      );

      const currentUrl = new URL(window.location);
      const logoutUrl = new URL(app['oidc:post_logout_redirect_uris']);
      logoutUrl.searchParams.append('redirect', urlJoin(currentUrl.origin, '/apps?uninstalled=true'));
      window.location.href = logoutUrl.toString();
    } catch (e) {
      notify(`Error on app installation: ${e.message}`, { type: 'error' });
    }
  }, [app, outbox, inbox, notify]);

  return uninstallApp;
};

export default useUninstallApp;
