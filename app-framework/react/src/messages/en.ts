// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

export default {
  apods: {
    action: {
      search: 'Search',
      share: 'Share',
      send_invitation: 'Send invitation |||| Send %{smart_count} invitations'
    },
    helper: {
      no_contact: 'You must add contacts to your network to share resources with them'
    },
    notification: {
      invitation_sent: '1 invitation sent |||| %{smart_count} invitations sent'
    },
    permission: {
      view: 'Allowed to view',
      share: 'Invite own contacts'
    },
    error: {
      app_status_unavailable: 'Unable to check app status',
      app_offline: 'The app backend is offline',
      app_not_registered: 'The app is not registered',
      app_not_listening: 'The app is not listening to %{uri}'
    },
    user_menu: {
      network: 'My network',
      apps: 'My applications',
      data: 'My data',
      settings: 'Settings'
    }
  }
};
