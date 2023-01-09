// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

module.exports = {
  app: {
    action: {
      accept: 'Accepter',
      accept_contact_request: 'Accepter la demande',
      add: 'Ajouter',
      add_contact: 'Ajouter un contact',
      copy: 'Copier dans votre presse-papier',
      edit_profile: 'Éditer mon profil',
      ignore: 'Ignorer',
      ignore_contact_request: 'Ignorer la demande',
      login: 'Se connecter avec un compte',
      reject: 'Refuser',
      reject_contact_request: 'Rejeter la demande',
      remove_contact: 'Retirer de mes contacts',
      send: 'Envoyer',
      send_message: 'Envoyer un message',
      signup: 'Créer un nouveau compte',
      reset_password: 'Réinitialisation du mot de passe',
      set_new_password: 'Definir un nouveau mot de passe',
    },
    page: {
      contacts: 'Mon réseau',
      contacts_short: 'Réseau',
      profile: 'Mon profil',
      profile_short: 'Profil',
      addresses: 'Mes adresses',
      addresses_short: 'Adresses',
      settings: 'Paramètres',
      settings_short: 'Paramètres',
    },
    card: {
      add_contact: 'Ajouter un contact',
      contact_requests: 'Demandes de contact',
      share_contact: 'Mon lien de contact',
    },
    block: {
      contact_requests: 'Nouvelles demandes de contact',
      g1_account: 'Compte G1'
    },
    input: {
      about_you: 'Quelques mots sur vous pour aider la personne à vous reconnaître',
      message: 'Message',
      user_id: 'Identifiant utilisateur',
      email: 'Email',
      current_password: 'Mot de passe actuel',
      new_password: 'Nouveau mot de passe',
      confirm_new_password: 'Confirmer le nouveau mot de passe'
    },
    helper: {
      add_contact: "Pour faire une demande de mise en relation, vous devez connaître l'identifiant de la personne (au format @bob@serveur.com).",
      message_profile_show_right: "Envoyer un message à %{username} lui donnera le droit de voir votre profil, pour lui permettre de vous répondre.",
      profile_visibility: "Votre profil n'est visible que des personnes que vous avez accepté dans votre réseau",
      share_contact: 'Pour vous connecter avec une personne que vous connaissez, vous pouvez lui envoyer le lien ci-dessous.',
      location_comment: 'Indications supplémentaires pour aider à trouver ce lieu',
      g1_tipjar_field: 'Pour envoyer de la monnaie libre à cet utilisateur, copiez sa clé publique ci-dessous et utilisez-la dans le logiciel Cesium.',
      g1_tipjar_input: 'La clé publique de votre compte Ğ1. Permet aux autres membres du réseau de facilement vous envoyer de la monnaie libre.'
    },
    message: {
      copied_to_clipboard: 'Copié !',
      no_condition: 'Aucune',
      you_participated_to_same_event: 'Vous avez participé à la même rencontre',
    },
    notification: {
      contact_request_accepted: 'Demande de contact acceptée',
      contact_request_ignored: 'Demande de contact ignorée',
      contact_request_rejected: 'Demande de contact refusée',
      contact_request_sent: 'Demande de contact envoyée',
      contact_removed: 'Contact supprimé',
      login_to_connect_user: 'Veuillez vous créer un compte pour vous connecter avec %{username}',
      message_sent: 'Votre message a bien été envoyé',
      message_send_error: "Erreur lors de l'envoi du message: %{error}",
      profile_data_not_found: "Votre profil n'a pas été trouvé, veuillez vous déconnecter et vous reconnecter",
      user_not_found: "L'utilisateur %{username} n'existe pas",
      reset_password_submitted: "Un e-mail a été envoyé avec les instructions de réinitialisation du mot de passe",
      reset_password_error: "Une erreur s'est produite",
      password_changed: "Le mot de passe a été changé avec succès",
      new_password_error: "Une erreur s'est produite",
      invalid_password: "Mot de passe incorrect",
      get_settings_error: "Une erreur s'est produite",
      update_settings_error: "Une erreur s'est produite",
    },
    user: {
      unknown: 'Inconnu',
    },
    validation: {
      email: "Doit être un email valide",
      confirmNewPassword: "Doit être le même que le nouveau champ de mot de passe"
    },
  },
};
