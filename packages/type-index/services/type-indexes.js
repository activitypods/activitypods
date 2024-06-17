const { ControlledContainerMixin, getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { namedNode, triple } = require('@rdfjs/data-model');
const TypeRegistrationsService = require('./type-registrations');

module.exports = {
  name: 'type-indexes',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['solid:TypeIndex']
  },
  create() {
    this.broker.createService({
      mixins: [TypeRegistrationsService]
    });
  },
  actions: {
    async createAndAttachToWebId(ctx) {
      const { webId } = ctx.params;

      const indexUri = await this.actions.post(
        {
          resource: {
            type: ['solid:TypeIndex', 'solid:ListedDocument']
          },
          webId
        },
        { parentCtx: ctx }
      );

      await ctx.call('ldp.resource.patch', {
        resourceUri: webId,
        triplesToAdd: [
          triple(namedNode(webId), namedNode('http://www.w3.org/ns/solid/terms#publicTypeIndex'), namedNode(indexUri))
        ],
        webId
      });
    },
    async findByWebId(ctx) {
      const { webId } = ctx.params;

      const user = await ctx.call('ldp.resource.get', {
        resourceUri: webId,
        accept: MIME_TYPES.JSON,
        webId
      });

      return user['solid:publicTypeIndex'];
    },
    async migrate(ctx) {
      const accounts = await ctx.call('auth.account.find');
      for (const { webId } of accounts) {
        this.logger.info(`Migrating ${webId}...`);
        await this.actions.createAndAttachToWebId({ webId }, { parentCtx: ctx });
      }
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;
      await this.actions.createAndAttachToWebId({ webId }, { parentCtx: ctx });
    }
  }
};
