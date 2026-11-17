import { ServiceSchema } from 'moleculer';

// An application can only act on behalf of a user if the user registered it
const ClientAuthorizerSchema = {
  name: 'client-authorizer' as const,
  dependencies: ['permissions'],
  async started() {
    await this.broker.call('permissions.addClientAuthorizer', { actionName: `${this.name}.authorize` });
  },
  actions: {
    authorize: {
      // Cleaned by app-registrations when a registration is created or deleted
      cache: { keys: ['clientId', 'webId'] },
      async handler(ctx) {
        const { webId, clientId } = ctx.params;
        if (webId === 'anon') return false;

        const account = await ctx.call('auth.account.findByWebId', { webId });
        if (!account) return false;

        // The request may be on another Pod than the user's one
        // Moleculer copies the meta of sub-calls back to the parent, so it must be restored
        const { dataset } = ctx.meta;
        try {
          return await ctx.call(
            'app-registrations.isRegistered',
            { agentUri: clientId, podOwner: webId },
            { meta: { dataset: account.username } }
          );
        } finally {
          ctx.meta.dataset = dataset;
        }
      }
    }
  }
} satisfies ServiceSchema;

export default ClientAuthorizerSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ClientAuthorizerSchema.name]: typeof ClientAuthorizerSchema;
    }
  }
}
