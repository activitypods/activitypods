const urlJoin = require('url-join');
const { ControlledContainerMixin, DereferenceMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { namedNode, triple } = require('@rdfjs/data-model');
const TypeRegistrationsService = require('./type-registrations');

module.exports = {
  name: 'type-indexes',
  mixins: [ControlledContainerMixin, DereferenceMixin],
  settings: {
    acceptedTypes: ['solid:TypeIndex'],
    newResourcesPermissions: webId => {
      if (webId === 'anon' || webId === 'system')
        throw new Error('Type indexes must be created by a registered webId.');

      return {
        anon: {
          read: true
        },
        user: {
          uri: webId,
          read: true,
          write: true,
          control: true
        }
      };
    },
    excludeFromMirror: true,
    // DereferenceMixin settings
    dereferencePlan: [{ property: 'solid:hasTypeRegistration' }]
  },
  created() {
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
          contentType: MIME_TYPES.JSON,
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
        const podUrl = await ctx.call('pod.getUrl', { webId });
        await this.actions.createAndAttachToWebId({ webId }, { parentCtx: ctx });

        // Go through each registered container and persist them
        const registeredContainers = await ctx.call('ldp.registry.list');
        for (const container of Object.values(registeredContainers)) {
          const containerUri = urlJoin(podUrl, container.path);
          for (const type of arrayOf(container.acceptedTypes)) {
            await ctx.call('type-registrations.register', { type, containerUri, webId });
            if (container.description) {
              await ctx.call('type-registrations.attachDescription', {
                type,
                webId,
                ...container.description
              });
            }
          }
        }
      }
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;

      // Wait until the /solid/type-index container has been created for the user
      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });
      await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

      // Wait until the /solid/type-registration container has been created for the user
      const registrationsContainerUri = await ctx.call('type-registrations.getContainerUri', { webId });
      await ctx.call('type-registrations.waitForContainerCreation', { containerUri: registrationsContainerUri });

      await this.actions.createAndAttachToWebId({ webId }, { parentCtx: ctx });

      const registeredContainers = await ctx.call('ldp.registry.list');

      // Go through each registered container
      for (const container of Object.values(registeredContainers)) {
        if (container.podsContainer !== true) {
          const podUrl = await ctx.call('pod.getUrl', { webId });
          const containerUri = urlJoin(podUrl, container.path);
          for (const type of arrayOf(container.acceptedTypes)) {
            await ctx.call('type-registrations.register', { type, containerUri, webId });
            if (container.description) {
              await ctx.call('type-registrations.attachDescription', {
                type,
                webId,
                ...container.description
              });
            }
          }
        }
      }
    }
  }
};
