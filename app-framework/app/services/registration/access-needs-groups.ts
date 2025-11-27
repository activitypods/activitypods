import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { arraysEqual } from '../../utils.ts';
import { necessityMapping } from '../../mappings.ts';
import { ServiceSchema } from 'moleculer';

const AccessNeedsGroupsSchema = {
  name: 'access-needs-groups' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/access-needs-groups',
    types: ['interop:AccessNeedGroup'],
    activateTombstones: false
  },
  actions: {
    put: {
      handler() {
        throw new Error(`The resources of type interop:AccessNeedGroup are immutable`);
      }
    },

    patch: {
      handler() {
        throw new Error(`The resources of type interop:AccessNeedGroup are immutable`);
      }
    },

    createOrUpdate: {
      async handler(ctx: any) {
        const { accessNeeds: accessNeedsByNecessity } = ctx.params;

        for (const [necessity, accessNeeds] of Object.entries(accessNeedsByNecessity)) {
          let newAccessNeedsUris = [];

          const existingAccessNeedGroup = await this.actions.findByNecessity({ necessity }, { parentCtx: ctx });

          // @ts-expect-error TS(18046): 'accessNeeds' is of type 'unknown'.
          if (accessNeeds.length > 0) {
            /*
             * PARSE SPECIAL RIGHTS
             */
            // TODO Ensure the special right is valid
            // @ts-expect-error TS(18046): 'accessNeeds' is of type 'unknown'.
            const newSpecialRights = accessNeeds.filter((a: any) => typeof a === 'string');
            const haveSpecialRightsChanged = !arraysEqual(
              newSpecialRights,
              existingAccessNeedGroup?.['apods:hasSpecialRights']
            );

            /*
             * GO THROUGH NEW ACCESS NEEDS AND CREATE THEM IF NECESSARY
             */
            let haveAccessNeedsChanged = false;

            // @ts-expect-error TS(18046): 'accessNeeds' is of type 'unknown'.
            for (const accessNeed of accessNeeds.filter((a: any) => typeof a !== 'string')) {
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
                    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    'interop:accessNecessity': necessityMapping[necessity],
                    'interop:preferredScope': accessNeed.preferredScope || 'interop:All'
                  },
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
                (uri: any) => !newAccessNeedsUris.includes(uri)
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
                    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    'interop:accessNecessity': necessityMapping[necessity],
                    'interop:accessScenario': 'interop:PersonalAccess',
                    'interop:authenticatedAs': 'interop:SocialAgent',
                    'interop:hasAccessNeed': newAccessNeedsUris,
                    'apods:hasSpecialRights': newSpecialRights
                  },
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
              await this.actions.delete(
                { resourceUri: existingAccessNeedGroup.id, webId: 'system' },
                { parentCtx: ctx }
              );
              for (const accessNeedUri of arrayOf(existingAccessNeedGroup['interop:hasAccessNeed'])) {
                this.logger.info(`Deleting related access need ${accessNeedUri}`);
                await ctx.call('access-needs.delete', { resourceUri: accessNeedUri, webId: 'system' });
              }
            }
          }
        }
      }
    },

    findByNecessity: {
      async handler(ctx: any) {
        const { necessity } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              'http://www.w3.org/ns/solid/interop#accessNecessity': necessityMapping[necessity]
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('app.attachAccessNeedGroup', { accessNeedGroupUri: res });
        return res;
      },
      async delete(ctx, res) {
        await ctx.call('app.detachAccessNeedGroup', { accessNeedGroupUri: ctx.params.resourceUri });
        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default AccessNeedsGroupsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessNeedsGroupsSchema.name]: typeof AccessNeedsGroupsSchema;
    }
  }
}
