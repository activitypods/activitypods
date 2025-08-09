import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

const MigrationSchema = {
  name: 'migration' as const,
  settings: {
    baseUrl: null
  },
  actions: {
    migrate: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { version } = ctx.params;

        if (version === '2.1.0') {
          // Keep URIs in memory to be able to remove them from the app WebID
          const accessDescriptionSetsUris = await ctx.call('ldp.container.getUris', {
            containerUri: urlJoin(this.settings.baseUrl, 'interop/access-description-set')
          });

          ctx.meta.activateTombstones = false;

          this.logger.info('Deleting class descriptions...');
          await ctx.call('ldp.container.clear', {
            containerUri: urlJoin(this.settings.baseUrl, 'apods/class-description'),
            webId: 'system'
          });
          await ctx.call('ldp.container.delete', {
            containerUri: urlJoin(this.settings.baseUrl, 'apods/class-description'),
            webId: 'system'
          });
          await ctx.call('ldp.container.delete', {
            containerUri: urlJoin(this.settings.baseUrl, 'apods'),
            webId: 'system'
          });

          this.logger.info('Deleting access description sets...');
          await ctx.call('ldp.container.clear', {
            containerUri: urlJoin(this.settings.baseUrl, 'interop/access-description-set'),
            webId: 'system'
          });
          await ctx.call('ldp.container.delete', {
            containerUri: urlJoin(this.settings.baseUrl, 'interop/access-description-set'),
            webId: 'system'
          });

          const app = await ctx.call('app.get');
          await ctx.call('ldp.resource.patch', {
            resourceUri: app.id,
            triplesToRemove: accessDescriptionSetsUris.map((uri: any) =>
              rdf.quad(
                rdf.namedNode(app.id),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
                rdf.namedNode(uri)
              )
            ),
            webId: 'system'
          });
        } else {
          throw new Error(`Unknown version ${version}`);
        }
      }
    })
  }
} satisfies ServiceSchema;

export default MigrationSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [MigrationSchema.name]: typeof MigrationSchema;
    }
  }
}
