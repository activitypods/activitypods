// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

module.exports = {
  app: {
    action: {
      accept: 'Accepter',
      accept_contact_request: 'Accepter la demande',
      add: 'Ajouter',
      add_contact: 'Ajouter à mes contacts',
      add_location: 'Ajouter une adresse',
      copy: 'Copier dans votre presse-papier',
      edit_profile: 'Éditer mon profil',
      edit_public_profile: 'Éditer le profil public',
      edit_private_profile: 'Éditer le profil privé',
      ignore: 'Ignorer',
      ignore_contact: 'Ignorer',
      ignore_contact_request: 'Ignorer la demande',
      login: 'Se connecter',
      open_app: "Ouvrir l'appli",
      delete_app: "Supprimer l'appli",
      reject: 'Refuser',
      reject_contact_request: 'Rejeter la demande',
      remove_contact: 'Retirer de mes contacts',
      send: 'Envoyer',
      send_message: 'Envoyer un message',
      send_request: 'Envoyer demande',
      signup: "S'inscrire",
      reset_password: 'Mot de passe oublié ?',
      revoke_access: "Révoquer l'accès",
      set_new_password: 'Definir un nouveau mot de passe',
      undo_ignore_contact: 'Ne plus ignorer',
      upgrade: 'Mettre à jour',
      select: 'Sélectionner',
      connect: "Accepter l'invitation",
      continue: 'Continuer',
      delete_pod: 'Effacer mon compte',
      export_pod: 'Exporter mes données',
      set_default_app: 'Définir appli par défaut',
      view_private_profile: 'Voir votre profil privé',
      view_public_profile: 'Voir votre profil public',
      create_group: 'Créer un groupe',
      skip_to_main: 'Passer au contenu principal',
      view_contact_profile: 'Voir le profil de %{name}',
      edit_profile: 'Modifier votre profil'
    },
    tag: {
      members: 'Contacts',
      no_members: "L'étiquette n'a pas encore été attribuée",
      label: 'Nom',
      remove_members: 'Retirer sélection',
      profile_name: 'Nom',
      tag: 'Étiquette',
      profile: 'Profil',
      create: 'Nouvelle étiquette',
      add_members: 'Ajouter des membres'
    },
    page: {
      contacts: 'Mon réseau',
      contacts_short: 'Réseau',
      data: 'Mes données',
      data_short: 'Données',
      apps: 'Mes applications',
      apps_short: 'Applis',
      available_apps: 'Applications disponibles',
      addresses: 'Mes adresses',
      settings: 'Paramètres',
      settings_short: 'Paramètres',
      settings_profiles: 'Mes profils',
      settings_advanced: 'Paramètres avancés',
      settings_email: 'Modifier mon mail',
      settings_password: 'Modifier mon mot de passe',
      settings_locale: 'Changer ma langue',
      add_contact: 'Demander une mise en relation',
      create_profile: 'Créez votre profil',
      authorize: 'Autorisation requise',
      groups: 'Étiquettes',
      groups_short: 'Étiquettes',
      invite: '%{username} souhaite vous inviter dans son réseau',
      invite_loading: "Chargement de l'invitation...",
      invite_connect: '%{username} souhaite vous inviter dans son réseau',
      choose_provider: 'Choisissez un hébergeur',
      choose_custom_provider: 'Choisir un autre hébergeur',
      invite_success: 'Connection établie !',
      delete_pod: 'Effacer le compte',
      export_pod: 'Exporter les données'
    },
    description: {
      delete_pod: `En continuant, vous effacerez votre espace de données et toutes les données qui s'y trouvent. Cette action est irréversible! Nous vous conseillons d'exporter d'abord vos données (dans les paramètres avancés). Pour continuer, tapez "%{confirm_text}".`,
      delete_pod_confirm_text: 'effacer compte',
      export_pod:
        'Vous pouvez télécharger toutes les données de votre espace de donnée. Cette action peut prendre un certain temps.'
    },
    dialog: {
      app_permissions: "Permissions de l'application"
    },
    setting: {
      profiles: 'Mes profils',
      profile: '%{smart_count} profil |||| %{smart_count} profils',
      private_profile: 'Profil privé',
      private_profile_desc: 'Visible seulement par mes contacts',
      public_profile: 'Profil public',
      public_profile_desc: 'Visible de tout le monde, sans restriction',
      email: 'Adresse mail',
      password: 'Mot de passe',
      addresses: 'Mes adresses',
      address: '%{smart_count} adresse |||| %{smart_count} adresses',
      locale: 'Langue',
      export: 'Exporter les données',
      delete: 'Effacer le compte',
      developer_mode: 'Mode développeur'
    },
    authorization: {
      required: 'Accès requis',
      optional: 'Accès optionnel',
      read: 'Lire',
      append: 'Enrichir',
      write: 'Écrire',
      control: 'Administrer',
      read_inbox: 'Lire ma boîte de réception',
      read_outbox: "Lire ma boîte d'envoi",
      post_outbox: "Poster dans ma boîte d'envoi",
      query_sparql_endpoint: 'Rechercher mes données',
      create_wac_group: 'Créer et gérer des groupes de permissions',
      create_collection: 'Créer et gérer des collections',
      update_webid: 'Modifier mon identité (WebId)',
      unknown: 'Permission inconnue "%{key}"'
    },
    card: {
      add_contact: 'Ajouter un contact',
      contact_requests: 'Demandes de contact',
      share_contact: 'Mon lien de contact'
    },
    block: {
      contact_requests: 'Nouvelles demandes de contact'
    },
    input: {
      about_you: 'Quelques mots sur vous',
      message: 'Message',
      user_id: 'Identifiant utilisateur',
      email: 'Email',
      current_password: 'Mot de passe actuel',
      new_password: 'Nouveau mot de passe',
      confirm_new_password: 'Confirmer le nouveau mot de passe',
      provider_url: "URL de l'espace personnel (POD)",
      creator: 'Créé par',
      created: 'Créé le',
      modified: 'Modifié le',
      confirm_delete: 'Confirmer la suppression',
      with_backups: 'Inclure les backups de la base de donnée (si disponibles)'
    },
    helper: {
      add_contact:
        "Pour faire une demande de mise en relation, vous devez connaître l'identifiant de la personne (au format @bob@serveur.com).",
      user_id: "Entrez l'identifiant de la personne que vous souhaitez contacter",
      about_you: "Présentez-vous brièvement pour que la personne puisse vous identifier",
      message_profile_show_right:
        'Envoyer un message à %{username} lui donnera le droit de voir votre profil, pour lui permettre de vous répondre.',
      profile_visibility: "Votre profil n'est visible que des personnes que vous avez accepté dans votre réseau",
      share_contact:
        'Pour vous connecter avec une personne que vous connaissez, vous pouvez lui envoyer le lien ci-dessous.',
      location_comment: 'Indications supplémentaires pour aider à trouver ce lieu',
      login: 'Je me connecte à mon espace personnel',
      signup: 'Je crée mon espace personnel',
      reset_password:
        'Entrez votre adresse mail ci-dessous et nous vous enverrons un lien pour réinitialiser votre mot de passe',
      set_new_password: 'Veuillez entrer votre adresse mail et un nouveau mot de passe ci-dessous',
      create_profile:
        'Maintenant que votre compte est créé, veuillez créer votre profil. Celui-ci ne sera visible par défaut que des personnes que vous acceptez dans votre réseau.',
      authorize_register: "Pour être utilisée, l'application requiert les autorisations suivantes",
      authorize_upgrade:
        "L'application a été mise à jour et requiert maintenant les nouvelles autorisations ci-dessous",
      invite_text_logged_out:
        "Un espace personnel est l'endroit où vous stockez vos données. Tout comme les comptes email, il est décentralisé, ce qui vous permet de choisir un fournisseur de confiance. Au lieu de créer un nouveau compte pour chaque nouvelle application, vous pourrez utiliser le même compte. Les applications compatibles stockeront les données dans votre espace.",
      invite_text_logged_in:
        "En acceptant l'invitation, %{username} sera ajouté à vos contacts. Par ailleurs, vous lui donnez le droit de voir votre profil et de vous ajouter à ses propre contacts",
      choose_provider_text_signup:
        'Comme pour les e-mails, vous pouvez décider où vous souhaitez créer votre espace personnel. Choisissez un hébergeur qui vous semble digne de confiance ou qui est proche de vous.',
      more_about_pods: 'En savoir plus sur les espaces de données.',
      choose_pod_provider:
        'The pod provider is the place where your data space is located. Like with an email provider, it will store your data.',
      choose_custom_provider:
        "Si l'hébergeur que vous recherchez n'est pas listé, vous pouvez entrer son adresse ci-dessous (par exemple https://mon-fournisseur.com).",
      username_cannot_be_modified: 'Votre identifiant ne peut être modifié',
      public_profile_view: 'Vous visualisez votre profil public, visible de tout le monde.',
      private_profile_view: 'Vous visualisez votre profil privé, visible seulement de vos contacts.',
      create_group:
        'Veuillez sélectionner dans la liste ci-dessous le fournisseur que vous souhaitez utiliser pour créer votre groupe',
      cannot_show_permissions_of_offline_app:
        "L'application étant hors ligne, nous ne pouvons pas vous montrer les autorisations que vous lui avez accordées de manière lisible. Vous pouvez toujours révoquer toutes les autorisations en cliquant sur le bouton ci-dessous.",
      cannot_add_addresses:
        "Vous ne pouvez pas ajouter d'adresses car votre hébergeur n'a pas configuré d'access token pour MapBox"
    },
    message: {
      copied_to_clipboard: 'Copié !',
      no_condition: 'Aucune',
      you_participated_to_same_event: 'Vous avez participé à la même rencontre',
      verified_app: 'Application vérifiée',
      verified: 'Vérifiée',
      offline: 'Hors ligne',
      upgrade_required: 'Mise à jour requise',
      no_app_registration: 'Aucune application enregistrée',
      connection_successful: 'Vous êtes maintenant connecté !',
      pod_creation_progress: 'Compte en cours de création...',
      app_upgrade_cancel: "Supprimer l'application ?",
      app_upgrade_cancel_description:
        "Cette application ne peut pas fonctionner si vous ne lui donnez pas les autorisations qu'elle demande. Est-ce que vous souhaitez supprimer l'application ?",
      default_app_changed: "L'application par défaut a été changée",
      backend_offline: 'Le serveur est en panne. Merci de revenir plus tard.'
    },
    notification: {
      contact_request_accepted: 'Demande de contact acceptée',
      contact_request_ignored: 'Demande de contact ignorée',
      contact_request_rejected: 'Demande de contact refusée',
      contact_request_sent: 'Demande de contact envoyée',
      contact_added: 'Contact ajouté',
      contact_removed: 'Contact supprimé',
      contact_ignored: 'Contact ignoré. Vous ne serez plus notifié de ses invitations.',
      contact_ignore_undone: 'Vous recevrez à nouveau les invitations de ce contact.',
      login_to_connect_user: 'Veuillez vous créer un compte pour vous connecter avec %{username}',
      message_sent: 'Votre message a bien été envoyé',
      message_send_error: "Erreur lors de l'envoi du message: %{error}",
      profile_data_not_found: "Votre profil n'a pas été trouvé, veuillez vous déconnecter et vous reconnecter",
      user_not_found: "L'utilisateur %{username} n'existe pas",
      reset_password_submitted: 'Un e-mail a été envoyé avec les instructions de réinitialisation du mot de passe',
      reset_password_error: "Une erreur s'est produite",
      password_changed: 'Le mot de passe a été changé avec succès',
      new_password_error: "Une erreur s'est produite",
      invalid_password: 'Mot de passe incorrect',
      locale_changed: 'La langue a été changée avec succès',
      get_settings_error: "Une erreur s'est produite",
      update_settings_error: "Une erreur s'est produite",
      verified_applications_load_failed: 'Impossible de charger la liste des applications vérifiées',
      app_registration_progress: 'Enregistrement en cours...',
      app_upgrade_progress: 'Mise à jour en cours...',
      app_removal_in_progress: 'Suppression en cours...',
      app_upgraded: 'Application mise à jour',
      app_removed: 'Application supprimée',
      home_address_updated: 'Adresse du domicile mise à jour',
      home_address_deleted: 'Adresse du domicile enlevée',
      send_request_error: "Erreur lors de l'envoi de la demande : %{error}",
      connection_accepted: 'Vous avez accepté la demande de connexion.',
      invite_cap_invalid: "Le lien d'invitation n'est pas valide",
      invite_cap_fetch_error:
        "Une erreur s'est produite lors de la récupération de l'invitation. Elle pourrait ne pas être valide.\n%{error}",
      invite_cap_missing: "Impossible de générer un lien d'invitation (missing capability)",
      invite_cap_profile_fetch_error: "Erreur lors de la recherche du profil associé au lien d'invitation",
      pod_provider_fetch_error: "Erreur lors de la recherche d'autres hébergeurs : %{error}",
      contact_link_copied: 'Lien de contact copié avec succès',
      already_connected: "Tu es déjà connecté avec la personne qui t'a invité."
    },
    user: {
      unknown: 'Inconnu',
      location: 'Chez %{name}',
      member_since: 'Membre depuis'
    },
    group: {
      id: 'Identifiant unique',
      type: 'Type',
      type_organization: 'Organisation',
      type_group: 'Groupe',
      name: 'Nom',
      image: 'Logo'
    },
    validation: {
      email: 'Doit être un email valide',
      confirmNewPassword: 'Doit être le même que le nouveau champ de mot de passe',
      password_strength: 'Force du mot de passe',
      password_too_weak: 'Mot de passe trop faible. Augmentez la longueur ou ajoutez des caractères spéciaux.',
      url: 'Doit être une URL valide',
      uri: {
        no_http: 'Doit commencer par http:// ou https://',
        no_base_url: "L'URL doit se composer uniquement du domaine",
        no_tld: "L'URI doit avoir un TLD (par exemple `.com` ou `.net`)"
      }
    },
    steps: {
      title: 'Comment ça marche ?',
      1: {
        title: 'Je crée mon espace de donnée personnel (Pod)',
        text: "Un seul endroit pour toutes mes données, c'est pas trop tôt !"
      },
      2: {
        title: 'Je me connecte aux applis compatibles',
        text: "Rencontres, petites annonces... et beaucoup d'autres à venir !"
      },
      3: {
        title: 'Mes données sont enregistrées sur mon Pod',
        text: "Les administrateurs des applications n'y ont pas accès."
      },
      4: {
        title: 'Je choisis avec qui je partage mes données',
        text: 'A tout moment, je sais qui voit mes données. Je peux révoquer les droits.'
      }
    },
    titles: {
      home: 'Bienvenue - %{appName}',
      login: 'Connexion - %{appName}',
      signup: 'Inscription - %{appName}',
      applications: 'Mes Applications - %{appName}',
      settings: 'Paramètres - %{appName}',
      network: 'Mon Réseau - %{appName}',
      create_group: 'Créer un Groupe - %{appName}',
      group_settings: 'Paramètres de %{groupName} - %{appName}'
    },
    placeholder: {
      user_id: "@utilisateur@serveur.com",
      about_you: "Bonjour, je souhaiterais vous ajouter à mon réseau...",
    },
    accessibility: {
      profile_picture_of: "Photo de profil de %{name}",
      your_profile_picture: "Votre photo de profil",
      invitation_link: "Lien d'invitation",
      copy_invitation_link: "Lien d'invitation à copier",
      copy_invitation_link_button: "Copier le lien",
      skip_link_description: "Ce lien apparaît lorsqu'il reçoit le focus et permet d'accéder directement au contenu principal de la page en sautant la navigation",
      network_link_description: "Accéder à la page de votre réseau de contacts",
      apps_link_description: "Accéder à la page de gestion de vos applications",
      data_link_description: "Accéder à la page de gestion de vos données personnelles",
      settings_link_description: "Accéder à la page des paramètres de votre compte",
      contact_list_profile_picture: "Cette photo apparaît dans la liste de vos contacts et permet d'identifier visuellement %{name}",
      contact_list_profile_link: "Cliquez pour accéder au profil détaillé de %{name} et voir toutes ses informations"
    }
  }
};
