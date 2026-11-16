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
      async handler(ctx) {
        const { webId, clientId } = ctx.params;
        if (webId === 'anon') return false;

        const account = await ctx.call('auth.account.findByWebId', { webId });
        if (!account) return false;

        return await ctx.call('app-registrations.isRegistered', { agentUri: clientId, podOwner: webId });
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
