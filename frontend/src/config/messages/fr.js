// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

module.exports = {
  app: {
    action: {
      accept: 'Accepter',
      accept_contact_request: 'Accepter la demande',
      add: 'Ajouter',
      add_contact: 'Envoyer la demande',
      add_location: 'Ajouter une adresse',
      copy: 'Copier dans votre presse-papier',
      edit_profile: 'Éditer mon profil',
      ignore: 'Ignorer',
      ignore_contact_request: 'Ignorer la demande',
      login: 'Se connecter',
      open_app: "Ouvrir l'appli",
      reject: 'Refuser',
      reject_contact_request: 'Rejeter la demande',
      remove_contact: 'Retirer de mes contacts',
      send: 'Envoyer',
      send_message: 'Envoyer un message',
      signup: "S'inscrire",
      reset_password: 'Mot de passe oublié ?',
      set_new_password: 'Definir un nouveau mot de passe',
    },
    page: {
      contacts: 'Mon réseau',
      contacts_short: 'Réseau',
      profile: 'Mon profil',
      profile_short: 'Profil',
      apps: 'Mes applications',
      apps_short: 'Applis',
      addresses: 'Mes adresses',
      settings: 'Paramètres',
      settings_short: 'Paramètres',
      settings_email: 'Modifier mon mail',
      settings_password: 'Modifier mon mot de passe',
      add_contact: 'Demander une mise en relation',
      create_profile: 'Créez votre profil',
      authorize: 'Autorisation requise',
    },
    setting: {
      email: 'Adresse mail',
      password: 'Mot de passe',
      addresses: 'Mes adresses',
      address: "1 adresse |||| %{smart_count} adresses"
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
      about_you: 'Quelques mots sur vous',
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
      g1_tipjar_input: 'La clé publique de votre compte Ğ1. Permet aux autres membres du réseau de facilement vous envoyer de la monnaie libre.',
      login: 'Connectez-vous à votre espace personnel. Vous pouvez utiliser vos identifiants de Bienvenue chez moi.',
      signup: "Créez votre espace personnel. Si vous avez déjà un compte sur Bienvenue chez moi, ce n'est pas nécessaire",
      reset_password: "Entrez votre adresse mail ci-dessous et nous vous enverrons un lien pour réinitialiser votre mot de passe",
      set_new_password: "Veuillez entrer votre adresse mail et un nouveau mot de passe ci-dessous",
      create_profile: "Maintenant que votre compte est créé, veuillez créer votre profil. Celui-ci ne sera visible par défaut que des personnes que vous acceptez dans votre réseau.",
      authorize: "Autorisez-vous le site %{appDomain} à accéder à votre POD ?"
    },
    message: {
      copied_to_clipboard: 'Copié !',
      no_condition: 'Aucune',
      you_participated_to_same_event: 'Vous avez participé à la même rencontre',
      verified_app: "Application vérifiée",
      verified: "Vérifiée",
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
      verified_applications_load_failed: 'Impossible de charger la liste des applications vérifiées',
      app_uninstalled: 'Application désinstallée',
      home_address_updated: 'Adresse du domicile mise à jour'
    },
    user: {
      unknown: 'Inconnu',
      location: "Chez %{surname}"
    },
    validation: {
      email: "Doit être un email valide",
      confirmNewPassword: "Doit être le même que le nouveau champ de mot de passe"
    },
    steps: {
      title: 'Comment ça marche ?',
      1: {
        title: 'Je crée mon espace personnel (POD)',
        text: "Un seul endroit pour toutes mes données, c'est pas trop tôt !"
      },
      2: {
        title: 'Je me connecte aux applications compatibles',
        text: "Rencontres, petites annonces... et beaucoup d'autres à venir !",
      },
      3: {
        title: 'Mes données sont enregistrées sur mon POD',
        text: "Les administrateurs des applications n'y ont pas accès.",
      },
      4: {
        title: 'Je choisis avec qui je partage mes données',
        text: "A tout moment, je sais qui voit mes données. Je peux révoquer les droits.",
      }
    }
  },
};
