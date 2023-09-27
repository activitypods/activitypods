// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

module.exports = {
  app: {
    action: {
      accept: 'Accept',
      accept_contact_request: 'Accept contact request',
      add: 'Add',
      add_contact: 'Send request',
      add_location: 'Add an address',
      copy: 'Copy to clipboard',
      edit_profile: 'Edit my profile',
      ignore: 'Ignore',
      ignore_contact: 'Ignore contact',
      ignore_contact_request: 'Ignore contact request',
      login: 'Login with an account',
      open_app: 'Open application',
      reject: 'Reject',
      reject_contact_request: 'Reject contact request',
      remove_contact: 'Remove contact',
      send: 'Send',
      send_message: 'Send message',
      signup: 'Signup',
      reset_password: 'Reset password',
      set_new_password: 'Set new password',
      undo_ignore_contact: 'No longer ignore'
    },
    group: {
      members: 'Members',
      no_members: "The group doesn't have any member yet",
      label: "Group's name",
      remove_members: 'Remove selected',
      profile_name: 'Name',
      profile: 'Profile',
      group: 'Group',
      add_members: 'Add members'
    },
    page: {
      contacts: 'My network',
      contacts_short: 'Network',
      profile: 'My profile',
      profile_short: 'Profile',
      apps: 'My applications',
      apps_short: 'Apps',
      groups: 'My groups',
      groups_short: 'Groups',
      settings: 'Settings',
      settings_short: 'Settings',
      addresses: 'My addresses',
      settings_email: 'Update email address',
      settings_password: 'Update password',
      add_contact: 'Send a connection request',
      create_profile: 'Create your profile',
      authorize: 'Authorization required'
    },
    setting: {
      email: 'Email address',
      password: 'Password',
      addresses: 'My addresses',
      address: '1 address |||| %{smart_count} addresses'
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
      confirm_new_password: 'Confirm new password'
    },
    helper: {
      add_contact: 'To add an user to your network, you need to know his ID (format: @bob@server.com).',
      message_profile_show_right:
        'Sending a message to %{username} will give him/her the right to see your profile, in order to be able to respond.',
      profile_visibility: 'Your profile is visible only by users you have accepted in your network',
      share_contact: 'To connect with someone you know, you can send him the link below.',
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
      authorize: 'Do you allow the website %{appDomain} to access your POD?'
    },
    message: {
      copied_to_clipboard: 'Copied !',
      no_condition: 'None',
      you_participated_to_same_event: 'You participated to the same event',
      verified_app: 'Verified application',
      verified: 'Verified'
    },
    notification: {
      contact_request_accepted: 'Contact request accepted',
      contact_request_ignored: 'Contact request ignored',
      contact_request_rejected: 'Contact request rejected',
      contact_request_sent: 'Contact request sent',
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
      get_settings_error: 'An error occurred',
      update_settings_error: 'An error occurred',
      verified_applications_load_failed: 'Unable to load the list of verified applications',
      app_uninstalled: 'Application uninstalled',
      home_address_updated: 'Home address updated',
      home_address_deleted: 'Home address deleted'
    },
    user: {
      unknown: 'Unknown',
      location: "At %{surname}'s"
    },
    validation: {
      email: 'Must be a valid email',
      confirmNewPassword: 'Must be the same as new password field',
      password_strength: 'Password strength',
      password_too_weak: 'Password too weak. Increase length or add special characters.'
    },
    steps: {
      title: 'How does it work?',
      1: {
        title: 'I create my personal space (POD)',
        text: "One place for all my data, it's about time!"
      },
      2: {
        title: 'I connect to compatible applications',
        text: 'Meetings, classified ads... and many more to come!'
      },
      3: {
        title: 'My data is securely stored on my POD',
        text: "Applications' administrators do not have access to it."
      },
      4: {
        title: 'I choose who I share my data with',
        text: 'At any time, I know who sees my data. I can revoke the rights.'
      }
    }
  }
};
