// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

module.exports = {
  app: {
    action: {
      accept: 'Accept',
      accept_contact_request: 'Accept contact request',
      add: 'Add',
      add_contact: 'Add contact',
      add_location: 'Add an address',
      copy: 'Copy to clipboard',
      edit_profile: 'Edit my profile',
      edit_public_profile: 'Edit public profile',
      edit_private_profile: 'Edit private profile',
      ignore: 'Ignore',
      ignore_contact: 'Ignore contact',
      ignore_contact_request: 'Ignore contact request',
      login: 'Login with an account',
      open_app: 'Open application',
      install_app: 'Install application',
      uninstall_app: 'Uninstall application',
      open: 'Open',
      reject: 'Reject',
      reject_contact_request: 'Reject contact request',
      remove_contact: 'Remove contact',
      send: 'Send',
      send_message: 'Send message',
      send_request: 'Send request',
      signup: 'Signup',
      reset_password: 'Reset password',
      set_new_password: 'Set new password',
      undo_ignore_contact: 'No longer ignore',
      select: 'Select',
      connect: 'Connect',
      continue: 'Continue',
      delete_pod: 'Delete all my data',
      export_pod: 'Download my data',
      set_default_app: 'Set default app',
      view_private_profile: 'View your private profile',
      view_public_profile: 'View your public profile',
      create_group: 'Create group'
    },
    tag: {
      members: 'Members',
      no_members: "The tag hasn't been attributed yet",
      label: 'Name',
      remove_members: 'Remove selected',
      profile_name: 'Name',
      tag: 'Tag',
      profile: 'Profile',
      create: 'New tag',
      add_members: 'Add members'
    },
    page: {
      contacts: 'My network',
      contacts_short: 'Network',
      data: 'My data',
      data_short: 'Data',
      apps: 'My applications',
      apps_short: 'Apps',
      settings: 'Settings',
      settings_short: 'Settings',
      settings_profiles: 'My profiles',
      settings_advanced: 'Advanced settings',
      available_apps: 'Available applications',
      addresses: 'My addresses',
      settings_email: 'Update email address',
      settings_password: 'Update password',
      settings_locale: 'Change language',
      add_contact: 'Send a connection request',
      create_profile: 'Create your profile',
      authorize: 'Authorization required',
      groups: 'Tags',
      groups_short: 'Tags',
      invite: '%{username} invited you to their network',
      invite_loading: 'Invitation loading...',
      invite_connect: 'Do you want to connect with %{username}?',
      choose_provider: 'Choose data space provider',
      choose_custom_provider: 'Choose custom provider',
      invite_success: 'Success!',
      delete_pod: 'Delete account',
      export_pod: 'Export all data'
    },
    description: {
      delete_pod:
        'By continuing, you will delete your account and all your data. This action is irreversible! Please consider exporting your data first (see advanced settings). If you want to continue, type "%{confirm_text}".',
      delete_pod_confirm_text: 'delete account',
      export_pod: 'You can export and download all your data as a backup. The action might take a short while.'
    },
    setting: {
      profiles: 'My profiles',
      profile: '%{smart_count} profile |||| %{smart_count} profiles',
      private_profile: 'Private profile',
      private_profile_desc: 'Visible only by my contact',
      public_profile: 'Public profile',
      public_profile_desc: 'Visible by everyone, without restriction',
      email: 'Email address',
      password: 'Password',
      addresses: 'My addresses',
      address: '%{smart_count} address |||| %{smart_count} addresses',
      locale: 'Language',
      export: 'Export all my data',
      delete: 'Delete my Pod',
      developer_mode: 'Developer mode'
    },
    authorization: {
      required: 'Required access',
      optional: 'Optional access',
      read: 'Read',
      append: 'Append',
      write: 'Write',
      control: 'Control',
      read_inbox: 'Read my inbox',
      read_outbox: 'Read my outbox',
      post_outbox: 'Post in my outbox',
      query_sparql_endpoint: 'Search on my data',
      create_wac_group: 'Create and manage permissions groups',
      create_collection: 'Create and manage collections',
      update_webid: 'Update my identity (WebId)',
      unknown: 'Unknown special right "%{key}"'
    },
    card: {
      add_contact: 'Add a contact',
      contact_requests: 'Contact requests',
      share_contact: 'My contact link'
    },
    block: {
      contact_requests: 'New contact requests',
      g1_account: 'G1 account'
    },
    input: {
      about_you: 'A few words about you',
      message: 'Message',
      user_id: 'User ID',
      email: 'Email',
      current_password: 'Current password',
      new_password: 'New password',
      confirm_new_password: 'Confirm new password',
      provider_url: 'Provider URL',
      creator: 'Creator',
      created: 'Created',
      modified: 'Modified',
      confirm_delete: 'Confirm deletion',
      with_backups: 'Include database backups (if available)'
    },
    helper: {
      add_contact: 'To add an user to your network, you need to know his ID (format: @bob@server.com).',
      message_profile_show_right:
        'Sending a message to %{username} will give him/her the right to see your profile, in order to be able to respond.',
      profile_visibility: 'Your profile is visible only by users you have accepted in your network',
      share_contact: 'To connect with someone you know, you can send them the link below.',
      location_comment: 'Additional information to help find this place',
      g1_tipjar_field:
        'To send G1 money to this user, copy his public key below and use it inside the Cesium software.',
      g1_tipjar_input: 'The public key of your Ğ1 account. This will allow other members to easily send you money.',
      login: 'Sign in to your personal space',
      signup: 'Create your personal space',
      reset_password: 'Enter your email address below and we will send you a link to reset your password',
      set_new_password: 'Please enter your email address and a new password below',
      create_profile:
        'Now that your account is created, please create your profile. By default, your profile will only be visible to the people you accept into your network.',
      authorize_install: 'To be installed, the app requires the following authorizations',
      authorize_upgrade: 'The app has been updated and now requires the following additional authorizations',
      invite_text_logged_out:
        "A personal data space is in some way similar to an email account; It's decentralized, so you can choose where your personal data is stored. Instead of creating a new account for every new app, you can login to compatible apps using your data space account. Apps then store your data in your data space.",
      invite_text_logged_in:
        '%{username} invited you to their network (by their invite link). Click "Connect" to accept the invitation.',
      choose_provider_text_signup:
        'Like with email, you can decide where you want to create your personal space. Choose a provider that seems trustworthy or that is close to you. If you are looking for one that\'s not in the list, click "Choose custom provider".',
      more_about_pods: 'Learn more about data spaces (PODs).',
      choose_custom_provider:
        'If the provider you are looking for is not listed, you can enter its address here (e.g. https://my-provider.example).',
      choose_pod_provider:
        'The pod provider is the place where your data space is located. Like with an email provider, it will store your data.',
      username_cannot_be_modified: 'The user ID cannot be modified',
      public_profile_view: 'You are viewing your public profile, visible by everyone',
      private_profile_view: 'You are viewing your private profile, visible only by your contacts',
      create_group: 'Please select on the list below the provider that you wish to use to create your group'
    },
    message: {
      copied_to_clipboard: 'Copied !',
      no_condition: 'None',
      you_participated_to_same_event: 'You participated to the same event',
      verified_app: 'Verified application',
      verified: 'Verified',
      no_app_registration: 'You have no installed application',
      connection_successful: 'You are now connected!',
      pod_creation_progress: 'Your Pod is being created...',
      app_installation_progress: 'App installation in progress...',
      app_upgrade_progress: 'App upgrade in progress...',
      app_upgrade_cancel: 'Uninstall the application ?',
      app_upgrade_cancel_description:
        "The application cannot work if you don't give it the authorizations it requires. Do you want to uninstall this application ?",
      default_app_changed: 'The default app has been successfully changed',
      backend_offline: 'The backend is offline. Please come back later.'
    },
    notification: {
      contact_request_accepted: 'Contact request accepted',
      contact_request_ignored: 'Contact request ignored',
      contact_request_rejected: 'Contact request rejected',
      contact_request_sent: 'Contact request sent',
      contact_added: 'Contact added',
      contact_removed: 'Contact removed',
      contact_ignored: 'Contact ignored',
      contact_ignore_undone: 'Contact no longer ignored',
      login_to_connect_user: 'Please create an account to connect with %{username}',
      message_sent: 'Your message has been sent',
      message_send_error: 'Error while sending the message: %{error}',
      profile_data_not_found: "Your profile couldn't be found, please reconnect yourself",
      user_not_found: "User %{username} doesn't exist",
      reset_password_submitted: 'An email has been send with reset password instructions',
      reset_password_error: 'An error occurred',
      password_changed: 'Password changed successfully',
      new_password_error: 'An error occurred',
      invalid_password: 'Invalid password',
      locale_changed: 'Language changed successfully',
      get_settings_error: 'An error occurred',
      update_settings_error: 'An error occurred',
      verified_applications_load_failed: 'Unable to load the list of verified applications',
      app_uninstallation_in_progress: 'Application uninstallation in progress...',
      app_uninstalled: 'Application uninstalled',
      home_address_updated: 'Home address updated',
      home_address_deleted: 'Home address deleted',
      send_request_error: 'Error while sending the request: %{error}',
      connection_accepted: 'You accepted the connection request.',
      invite_cap_invalid: 'The invite link is not valid',
      invite_cap_fetch_error: 'Error ocurred while fetching the invitation. It might not be valid. Error: %{error}',
      invite_cap_missing: 'Unable to generate an invite link (missing capability)',
      invite_cap_profile_fetch_error: 'Error while fetching the profile associated with the invite link.',
      pod_provider_fetch_error: 'Error while looking for other pod providers: %{error}',
      contact_link_copied: 'Contact link copied successfully',
      already_connected: 'You are already connected with the person who invited you.',
      export_failed: 'The export failed: %{error}'
    },
    user: {
      unknown: 'Unknown',
      location: "At %{name}'s",
      member_since: 'Member since'
    },
    group: {
      id: 'Unique ID',
      type: 'Type',
      type_organization: 'Organization',
      type_group: 'Group',
      name: 'Name',
      image: 'Logo'
    },
    validation: {
      email: 'Must be a valid email',
      confirmNewPassword: 'Must be the same as new password field',
      password_strength: 'Password strength',
      password_too_weak: 'Password too weak. Increase length or add special characters.',
      url: 'Must be a valid URL',
      uri: {
        no_http: 'Must start with http:// or https://',
        no_base_url: 'The URL must consist of the domain only.',
        no_tld: 'URI must have a TLD (e.g. `.com` or `.net`).'
      }
    },
    steps: {
      title: 'How does it work?',
      1: {
        title: 'I create my personal online datastore (Pod)',
        text: "One place for all my data, it's about time!"
      },
      2: {
        title: 'I connect to compatible applications',
        text: 'Meetings, classified ads... and many more to come!'
      },
      3: {
        title: 'My data is securely stored on my Pod',
        text: "Applications' administrators do not have access to it."
      },
      4: {
        title: 'I choose who I share my data with',
        text: 'At any time, I know who sees my data. I can revoke the rights.'
      }
    }
  }
};
