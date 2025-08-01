import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
import { foaf, schema } from '@semapps/ontologies';
import { ControlledContainerMixin, DereferenceMixin, getDatasetFromUri } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

const WebIdService = {
  name: 'webid' as const,
  mixins: [ControlledContainerMixin, DereferenceMixin],
  settings: {
    baseUrl: null,
    podProvider: false,
    // ControlledContainerMixin
    path: '/foaf/person',
    acceptedTypes: ['http://xmlns.com/foaf/0.1/Person'],
    podsContainer: false,
    // DereferenceMixin
    dereferencePlan: [
      {
        property: 'publicKey'
      },
      { property: 'assertionMethod' }
    ]
  },
  dependencies: ['ldp.resource', 'ontologies'],
  async created() {
    if (!this.settings.baseUrl) throw new Error('The baseUrl setting is required for webId service.');
  },
  async started() {
    await this.broker.call('ontologies.register', foaf);
    await this.broker.call('ontologies.register', schema);
  },
  actions: {
    get: defineAction({
      handler(ctx) {
        // Always get WebID as system and on the correct dataset, since they are public
        return ctx.call(
          'ldp.resource.get',
          {
            accept: this.settings.accept,
            ...ctx.params,
            webId: 'system'
          },
          {
            meta: {
              dataset: this.settings.podProvider ? getDatasetFromUri(ctx.params.resourceUri) : undefined
            }
          }
        );
      }
    }),

    createWebId: defineAction({
      /**
       * This should only be called after the user has been authenticated
       */
      async handler(ctx) {
        let { email, nick, name, familyName, homepage, ...rest } = ctx.params;

        if (!nick && email) {
          nick = email.split('@')[0].toLowerCase();
        }

        let webId;

        const resource = {
          '@type': 'foaf:Person',
          'foaf:nick': nick,
          'foaf:email': email,
          'foaf:name': name,
          'foaf:familyName': familyName,
          'foaf:homepage': homepage,
          ...rest
        };

        if (this.settings.podProvider) {
          // In Pod provider config, there is no LDP container for the webId, so we must create it directly
          webId = urlJoin(this.settings.baseUrl, nick);
          await this.actions.create(
            {
              resource: {
                '@id': webId,
                ...resource
              },
              contentType: MIME_TYPES.JSON,
              webId: 'system'
            },
            { parentCtx: ctx }
          );
        } else {
          if (!this.settings.path) throw new Error('The path setting is required');
          webId = await this.actions.post(
            {
              resource,
              slug: nick,
              contentType: MIME_TYPES.JSON,
              webId: 'system'
            },
            { parentCtx: ctx }
          );
        }

        const webIdData = await this.actions.get(
          {
            resourceUri: webId,
            accept: MIME_TYPES.JSON,
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        ctx.emit('webid.created', webIdData, { meta: { webId: null, dataset: null } });

        return webId;
      }
    })
  }
} satisfies ServiceSchema;

export default WebIdService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [WebIdService.name]: typeof WebIdService;
    }
  }
}
