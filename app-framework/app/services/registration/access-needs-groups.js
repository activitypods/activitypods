const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arraysEqual } = require('../../utils');
const { necessityMapping } = require('../../mappings');

module.exports = {
  name: 'access-needs-groups',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    acceptedTypes: ['interop:AccessNeedGroup'],
    readOnly: true,
    activateTombstones: false
  },
  actions: {
    put() {
      throw new Error(`The resources of type interop:AccessNeedGroup are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:AccessNeedGroup are immutable`);
    },
    async createOrUpdate(ctx) {
      const { accessNeeds: accessNeedsByNecessity } = ctx.params;

      for (const [necessity, accessNeeds] of Object.entries(accessNeedsByNecessity)) {
        let newAccessNeedsUris = [];

        const existingAccessNeedGroup = await this.actions.findByNecessity({ necessity });

        if (accessNeeds.length > 0) {
          /*
           * PARSE SPECIAL RIGHTS
           */
          // TODO Ensure the special right is valid
          const newSpecialRights = accessNeeds.filter(a => typeof a === 'string');
          const haveSpecialRightsChanged = !arraysEqual(
            newSpecialRights,
            existingAccessNeedGroup?.['apods:hasSpecialRights']
          );

          /*
           * GO THROUGH NEW ACCESS NEEDS AND CREATE THEM IF NECESSARY
           */
          let haveAccessNeedsChanged = false;

          for (const accessNeed of accessNeeds.filter(a => typeof a !== 'string')) {
            const existingAccessNeed = await ctx.call('access-needs.find', {
              shapeTreeUri: accessNeed.shapeTreeUri,
              accessMode: accessNeed.accessMode,
              necessity,
              preferredScope: accessNeed.preferredScope || 'interop:All'
            });

            if (existingAccessNeed) {
              this.logger.info(`Keeping access need ${existingAccessNeed.id} as it has not been changed.`);
              newAccessNeedsUris.push(existingAccessNeed.id);
            } else {
              haveAccessNeedsChanged = true;
              const newAccessNeedUri = await ctx.call('access-needs.post', {
                resource: {
                  '@type': 'interop:AccessNeed',
                  'interop:registeredShapeTree': accessNeed.shapeTreeUri,
                  'interop:accessMode': accessNeed.accessMode,
                  'interop:accessNecessity': necessityMapping[necessity],
                  'interop:preferredScope': accessNeed.preferredScope || 'interop:All'
                },
                contentType: MIME_TYPES.JSON,
                webId: 'system'
              });
              this.logger.info(`Created new access need ${newAccessNeedUri}`);
              newAccessNeedsUris.push(newAccessNeedUri);
            }
          }

          /*
           * DELETE EXISTING ACCESS NEEDS THAT ARE NOT IN THE NEW LIST
           */
          if (existingAccessNeedGroup) {
            const accessNeedsToDelete = arrayOf(existingAccessNeedGroup['interop:hasAccessNeed']).filter(
              uri => !newAccessNeedsUris.includes(uri)
            );
            if (accessNeedsToDelete.length > 0) {
              haveAccessNeedsChanged = true;
              for (const uri of accessNeedsToDelete) {
                this.logger.info(`Deleting access need ${uri} as it has been modified or removed.`);
                await ctx.call('access-needs.delete', { resourceUri: uri, webId: 'system' });
              }
            }
          }

          /*
           * CREATE A NEW ACCESS NEED GROUP IF IT HAS CHANGED
           */
          if (haveSpecialRightsChanged || haveAccessNeedsChanged) {
            this.logger.info(`The ${necessity} access needs and/or special rights have changed.`);

            if (existingAccessNeedGroup) {
              this.logger.info(`Deleting access need group ${existingAccessNeedGroup.id} as it must be recreated.`);
              await this.actions.delete(
                { resourceUri: existingAccessNeedGroup.id, webId: 'system' },
                { parentCtx: ctx }
              );
            }

            const accessNeedGroupUri = await this.actions.post(
              {
                resource: {
                  '@type': 'interop:AccessNeedGroup',
                  'interop:accessNecessity': necessityMapping[necessity],
                  'interop:accessScenario': 'interop:PersonalAccess',
                  'interop:authenticatedAs': 'interop:SocialAgent',
                  'interop:hasAccessNeed': newAccessNeedsUris,
                  'apods:hasSpecialRights': newSpecialRights
                },
                contentType: MIME_TYPES.JSON,
                webId: 'system'
              },
              {
                parentCtx: ctx
              }
            );

            this.logger.info(`Created new access need group ${accessNeedGroupUri}`);
          }
        } else {
          // If there are no more access needs...
          if (existingAccessNeedGroup) {
            this.logger.info(
              `Deleting access need group ${existingAccessNeedGroup.id} as there are no more ${necessity} access needs`
            );
            await this.actions.delete({ resourceUri: existingAccessNeedGroup.id, webId: 'system' }, { parentCtx: ctx });
            for (const accessNeedUri of arrayOf(existingAccessNeedGroup['interop:hasAccessNeed'])) {
              this.logger.info(`Deleting related access need ${accessNeedUri}`);
              await ctx.call('access-needs.delete', { resourceUri: accessNeedUri, webId: 'system' });
            }
          }
        }
      }
    },
    async findByNecessity(ctx) {
      const { necessity } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#accessNecessity': necessityMapping[necessity]
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('actors.attachAccessNeedGroup', { accessNeedGroupUri: res });
        return res;
      },
      async delete(ctx, res) {
        await ctx.call('actors.detachAccessNeedGroup', { accessNeedGroupUri: ctx.params.resourceUri });
        return res;
      }
    }
  }
};
