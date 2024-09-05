// Model https://github.com/marmelab/react-admin/blob/master/packages/ra-language-french/src/index.ts

export default {
  app: {
    action: {
      search: 'Rechercher',
      send_invitation: "Envoyer l'invitation |||| Envoyer %{smart_count} invitations",
      share: 'Partager'
    },
    helper: {
      no_contact: 'Vous devez ajouter des contacts à votre réseau pour leur partager des ressources'
    },
    notification: {
      invitation_sent: '1 invitation envoyée |||| %{smart_count} invitations envoyées'
    },
    permission: {
      view: 'Droit de voir',
      share: 'Inviter ses contacts'
    },
    user_menu: {
      network: 'Mon réseau',
      apps: 'Mes applis',
      data: 'Mes données',
      settings: 'Paramètres'
    }
  }
};
