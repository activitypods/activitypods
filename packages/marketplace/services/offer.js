const { ControlledContainerMixin, getContainerFromUri } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'marketplace.offer',
  mixins: [AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/offers',
    acceptedTypes: ['mp:Offer', 'mp:SaleOffer', 'mp:RentOffer', 'mp:LoanOffer', 'mp:GiftOffer', 'mp:BarterOffer'],
    dereference: ['mp:hasTimeCondition', 'mp:hasGeoCondition', 'mp:hasReciprocityCondition'],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      key: 'new_offer',
      title: {
        en: `{{emitterProfile.vcard:given-name}} published a classified "{{activity.object.pair:label}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a publié une petite annonce "{{activity.object.pair:label}}"`,
      },
      actionLink: '?type=mp:Offer&uri={{encodeUri activity.object.id}}',
    },
  },
  hooks: {
    after: {
      async create(ctx, res) {
        await ctx.call('marketplace.location.setNewRights', res);
        await ctx.call('marketplace.project.setNewRights', res);
        return res;
      },
      // TODO handle new PATCH method https://github.com/assemblee-virtuelle/activitypods/issues/42
      // async patch(ctx, res) {
      //   await ctx.call('marketplace.location.updateRights', res);
      //   return res;
      // },
      async put(ctx, res) {
        await ctx.call('marketplace.location.updateRights', res);
        return res;
      },
    },
  },
  events: {
    async 'webacl.resource.updated'(ctx) {
      const { uri, webId, isContainer, addPublicRead, removePublicRead } = ctx.params;
      // If a resource has been published or unpublished
      if (!isContainer && (addPublicRead || removePublicRead)) {
        // If this resource is an offer
        const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });
        if (getContainerFromUri(uri) === containerUri) {
          const offer = await ctx.call('ldp.resource.get', {
            resourceUri: uri,
            accept: MIME_TYPES.JSON,
            webId: 'system'
          });
          if (addPublicRead) {
            const isProjectPublic = await ctx.call('webacl.resource.isPublic', { resourceUri: offer['pair:partOf'] });
            if (!isProjectPublic) {
              await ctx.call('webacl.resource.addRights', {
                resourceUri: offer['pair:partOf'],
                additionalRights: {
                  anon: {
                    read: true
                  }
                },
                webId: 'system'
              });
            }
          } else if (removePublicRead) {
            // Look if other offers on the project are public
            const offersUris = await ctx.call('marketplace.project.getProjectOffers', { projectUri: offer['pair:partOf'] });
            let oneOfferIsPublic = false;
            for (let offerUri of offersUris) {
              // Don't look for the current offer since we know it's not public anymore
              if (offerUri !== uri) {
                const isPublic = await ctx.call('webacl.resource.isPublic', { resourceUri: offerUri });
                if (isPublic) {
                  oneOfferIsPublic = true;
                  break;
                }
              }
            }

            // If no other offer of the project is public, unpublish the project
            if (!oneOfferIsPublic) {
              await ctx.call('webacl.resource.removeRights', {
                resourceUri: offer['pair:partOf'],
                rights: {
                  anon: {
                    read: true
                  }
                },
                webId: 'system'
              });
            }
          }
        }
      }
    }
  }
};
