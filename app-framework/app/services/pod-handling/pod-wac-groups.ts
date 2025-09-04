// @ts-expect-error TS(7016): Could not find a declaration file for module 'spea... Remove this comment to see the full error message
import createSlug from 'speakingurl';
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';
import { ServiceSchema } from 'moleculer';

const PodWacGroupsSchema = {
  name: 'pod-wac-groups' as const,
  mixins: [FetchPodOrProxyMixin],
  actions: {
    get: {
      async handler(ctx) {
        const { groupUri, groupSlug, actorUri } = ctx.params;

        const { body, status } = await this.actions.fetch({
          url: groupUri || this.getGroupUri(groupSlug, actorUri),
          headers: {
            Accept: 'application/ld+json'
          },
          actorUri
        });

        return status === 200 ? body : false;
      }
    },

    list: {
      async handler(ctx) {
        const { actorUri } = ctx.params;
        const { origin, pathname } = new URL(actorUri);

        const { body, status } = await this.actions.fetch({
          url: `${origin}/_groups${pathname}`,
          headers: {
            Accept: 'application/ld+json'
          },
          actorUri
        });

        return status === 200 ? body : false;
      }
    },

    create: {
      async handler(ctx) {
        const { groupSlug, actorUri } = ctx.params;
        const { origin, pathname } = new URL(actorUri);

        const { status, statusText, headers } = await this.actions.fetch({
          url: `${origin}/_groups${pathname}`,
          method: 'POST',
          headers: {
            Slug: groupSlug
          },
          actorUri
        });

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
      async handler(ctx) {
        const { groupUri, groupSlug, actorUri } = ctx.params;

        const { status } = await this.actions.fetch({
          url: groupUri || this.getGroupUri(groupSlug, actorUri),
          method: 'DELETE',
          actorUri
        });

        return status === 204;
      }
    },

    addMember: {
      async handler(ctx) {
        const { groupUri, groupSlug, memberUri, actorUri } = ctx.params;

        const { status } = await this.actions.fetch({
          url: groupUri || this.getGroupUri(groupSlug, actorUri),
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ memberUri }),
          actorUri
        });

        return status === 204;
      }
    },

    removeMember: {
      async handler(ctx) {
        const { groupUri, groupSlug, memberUri, actorUri } = ctx.params;

        const { status } = await this.actions.fetch({
          url: groupUri || this.getGroupUri(groupSlug, actorUri),
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ deleteUserUri: memberUri }),
          actorUri
        });

        return status === 204;
      }
    },

    getUriFromCollectionUri: {
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { collectionUri } = ctx.params;
        const { origin, pathname } = new URL(collectionUri);
        return `${origin}/_groups${pathname}`;
      }
    }
  },
  methods: {
    // Return URL like http://localhost:3000/_groups/alice/contacts
    getGroupUri(groupSlug, podOwner) {
      const { origin, pathname } = new URL(podOwner);
      // Slugify with the same parameters as the webacl.group.create action
      groupSlug = createSlug(groupSlug, { lang: 'fr', custom: { '.': '.', '/': '/' } });
      return `${origin}/_groups${pathname}/${groupSlug}`;
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
