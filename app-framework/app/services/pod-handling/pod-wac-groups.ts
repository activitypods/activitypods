import createSlug from 'speakingurl';
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';
import { ServiceSchema } from 'moleculer';
import { getDatasetFromUri } from '@semapps/ldp';

const PodWacGroupsSchema = {
  name: 'pod-wac-groups' as const,
  mixins: [FetchPodOrProxyMixin],
  actions: {
    get: {
      async handler(ctx: any) {
        const { groupUri, groupSlug, actorUri } = ctx.params;

        const { body, status } = await this.actions.fetch(
          {
            url: groupUri || this.getGroupUri(groupSlug, actorUri),
            headers: {
              Accept: 'application/ld+json'
            },
            actorUri
          },
          { parentCtx: ctx }
        );

        return status === 200 ? body : false;
      }
    },

    list: {
      async handler(ctx: any) {
        const { actorUri } = ctx.params;
        const { origin } = new URL(actorUri);
        const dataset = getDatasetFromUri(actorUri);

        const { body, status } = await this.actions.fetch(
          {
            url: `${origin}/_groups/${dataset}`,
            headers: {
              Accept: 'application/ld+json'
            },
            actorUri
          },
          { parentCtx: ctx }
        );

        return status === 200 ? body : false;
      }
    },

    create: {
      async handler(ctx: any) {
        const { groupSlug, actorUri } = ctx.params;
        const { origin } = new URL(actorUri);
        const dataset = getDatasetFromUri(actorUri);

        const { status, statusText, headers } = await this.actions.fetch(
          {
            url: `${origin}/_groups/${dataset}`,
            method: 'POST',
            headers: {
              Slug: groupSlug
            },
            actorUri
          },
          { parentCtx: ctx }
        );

        if (status === 201) {
          return headers?.location;
        } else {
          this.logger.error(
            `Unable to create WAC group ${groupSlug} for actor ${actorUri}. Error ${status}: ${statusText}`
          );
          return false;
        }
      }
    },

    delete: {
      async handler(ctx: any) {
        const { groupUri, groupSlug, actorUri } = ctx.params;

        const { status } = await this.actions.fetch(
          {
            url: groupUri || this.getGroupUri(groupSlug, actorUri),
            method: 'DELETE',
            actorUri
          },
          { parentCtx: ctx }
        );

        return status === 204;
      }
    },

    addMember: {
      async handler(ctx: any) {
        const { groupUri, groupSlug, memberUri, actorUri } = ctx.params;

        const { status } = await this.actions.fetch(
          {
            url: groupUri || this.getGroupUri(groupSlug, actorUri),
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ memberUri }),
            actorUri
          },
          { parentCtx: ctx }
        );

        return status === 204;
      }
    },

    removeMember: {
      async handler(ctx: any) {
        const { groupUri, groupSlug, memberUri, actorUri } = ctx.params;

        const { status } = await this.actions.fetch(
          {
            url: groupUri || this.getGroupUri(groupSlug, actorUri),
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ deleteUserUri: memberUri }),
            actorUri
          },
          { parentCtx: ctx }
        );

        return status === 204;
      }
    },

    getUriFromCollectionUri: {
      async handler(ctx: any) {
        const { collectionUri } = ctx.params;
        const { origin, pathname } = new URL(collectionUri);
        return `${origin}/_groups${pathname}`;
      }
    }
  },
  methods: {
    // Return URL like http://localhost:3000/_groups/alice/contacts
    getGroupUri(groupSlug, podOwner) {
      const { origin } = new URL(podOwner);
      const dataset = getDatasetFromUri(podOwner);
      // Slugify with the same parameters as the webacl.group.create action
      groupSlug = createSlug(groupSlug, { lang: 'fr', custom: { '.': '.', '/': '/' } });
      return `${origin}/_groups/${dataset}/${groupSlug}`;
    }
  }
} satisfies ServiceSchema;

export default PodWacGroupsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodWacGroupsSchema.name]: typeof PodWacGroupsSchema;
    }
  }
}
