const { ControlledContainerMixin, hasType } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'syreen.offer',
  mixins: [AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/syreen/offers',
    acceptedTypes: ['syreen:Offer'],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      key: 'new_offer',
      title: {
        en: `{{emitterProfile.vcard:given-name}} published an offer "{{activity.object.syreen:label}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a publié une offre "{{activity.object.syreen:label}}"`
      },
      actionLink: '?type=syreen:Offer&uri={{encodeUri activity.object.id}}'
    }
  },
  hooks: {
    after: {
      async create(ctx, res) {
        // Do not await to increase performances
        ctx.call('syreen.project.setNewRights', res);
        ctx.call('syreen.location.setNewRights', res);
        return res;
      },
      async put(ctx, res) {
        // Do not await to increase performances
        ctx.call('syreen.location.updateRights', res);
        return res;
      }
    }
  },
  events: {
    async 'webacl.resource.updated'(ctx) {
      const { uri, isContainer, addPublicRead, removePublicRead } = ctx.params;
      // If a resource has been published or unpublished
      if (!isContainer && (addPublicRead || removePublicRead)) {
        const resource = await ctx.call('ldp.resource.get', {
          resourceUri: uri,
          accept: MIME_TYPES.JSON,
          webId: 'system'
        });
        if (hasType(resource, 'syreen:Offer')) {
          if (addPublicRead) {
            const isProjectPublic = await ctx.call('webacl.resource.isPublic', {
              resourceUri: resource['syreen:partOf']
            });
            if (!isProjectPublic) {
              await ctx.call('webacl.resource.addRights', {
                resourceUri: resource['syreen:partOf'],
                additionalRights: {
                  anon: {
                    read: true
                  }
                },
                webId: 'system'
              });
            }
            // TODO remove public right on location when offer is not public anymore
            await ctx.call('webacl.resource.addRights', {
              resourceUri: resource['syreen:hasLocation'],
              additionalRights: {
                anon: {
                  read: true
                }
              },
              webId: 'system'
            });
          } else if (removePublicRead) {
            // Look if other offers on the project are public
            const offersUris = await ctx.call('syreen.project.getProjectOffers', {
              projectUri: resource['syreen:partOf']
            });
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
                resourceUri: resource['syreen:partOf'],
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
