const urlJoin = require('url-join');
const { ACTOR_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { triple, namedNode } = require('@rdfjs/data-model');

const AccessNeedsService = require('./services/access-needs');
const AccessNeedsGroupsService = require('./services/access-needs-groups');
const ActorsService = require('./services/actors');
const interopJsonContext = require('./config/context.json');

const INTEROP_PREFIX = 'http://www.w3.org/ns/solid/interop#';

module.exports = {
  name: 'app',
  settings: {
    name: null,
    description: null,
    author: null,
    thumbnail: null,
    accessNeeds: {
      required: [],
      optional: []
    }
  },
  dependencies: [
    'activitypub',
    'activitypub.follow', // Ensure the /followers and /following collection are registered
    'auth.account',
    'ldp.container',
    'ldp.registry'
  ],
  created() {
    this.broker.createService(AccessNeedsService);
    this.broker.createService(AccessNeedsGroupsService);
    this.broker.createService(ActorsService);
  },
  async started() {
    await this.createActor();
  },
  methods: {
    async createActor() {
      // Ensure LDP sub-services have been started
      await this.broker.waitForServices(['ldp.container', 'ldp.resource']);

      const actorsContainerUri = await this.broker.call('actors.getContainerUri');
      const actorUri = urlJoin(actorsContainerUri, 'app');

      const actorExist = await this.broker.call('ldp.resource.exist', {
        resourceUri: actorUri
      });

      if (!actorExist) {
        this.logger.info(`Actor ${actorUri} does not exist yet, creating it...`);

        const account = await this.broker.call(
          'auth.account.create',
          {
            username: 'app',
            webId: actorUri
          },
          { meta: { isSystemCall: true } }
        );

        try {
          await this.broker.call('actors.post', {
            slug: 'app',
            resource: {
              '@context': [
                'https://www.w3.org/ns/activitystreams',
                {
                  interop: INTEROP_PREFIX
                }
              ],
              type: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
              preferredUsername: 'app',
              name: this.settings.name,
              'interop:applicationName': this.settings.name,
              'interop:applicationDescription': this.settings.description,
              'interop:applicationAuthor': this.settings.author,
              'interop:applicationThumbnail': this.settings.thumbnail
            },
            contentType: MIME_TYPES.JSON,
            webId: 'system'
          });
        } catch (e) {
          // Delete account if resource creation failed, or it may cause problems when retrying
          await this.broker.call('auth.account.remove', { id: account['@id'] });
          throw e;
        }

        this.actor = await this.broker.call('activitypub.actor.awaitCreateComplete', { actorUri });

        await this.createAccessNeeds();
      } else {
        this.actor = await this.broker.call('activitypub.actor.awaitCreateComplete', { actorUri });
      }
    },
    async createAccessNeeds() {
      let accessNeedGroupsUris = [];

      for (let [necessity, accessNeeds] of Object.entries(this.settings.accessNeeds)) {
        let accessNeedsUris = [],
          specialAccessNeedsUris = [];

        if (accessNeeds.length > 0) {
          for (const accessNeed of accessNeeds) {
            if (typeof accessNeed === 'string') {
              // If a string is provided, we have a special access need (e.g. apods:ReadInbox)
              specialAccessNeedsUris.push(accessNeed);
            } else {
              accessNeedsUris.push(
                await this.broker.call('access-needs.post', {
                  resource: {
                    '@context': interopJsonContext,
                    '@type': 'interop:AccessNeed',
                    'interop:accessNecessity':
                      necessity === 'required' ? 'interop:AccessRequired' : 'interop:AccessOptional',
                    'interop:accessMode': accessNeed.accessMode,
                    'apods:registeredClass': accessNeed.registeredClass
                  },
                  contentType: MIME_TYPES.JSON,
                  webId: 'system'
                })
              );
            }
          }

          accessNeedGroupsUris.push(
            await this.broker.call('access-needs-groups.post', {
              slug: necessity,
              resource: {
                '@context': interopJsonContext,
                '@type': 'interop:AccessNeedGroup',
                'interop:accessNecessity':
                  necessity === 'required' ? 'interop:AccessRequired' : 'interop:AccessOptional',
                'interop:accessScenario': 'interop:PersonalAccess',
                'interop:authenticatedAs': 'interop:SocialAgent',
                'interop:hasAccessNeeds': accessNeedsUris,
                'apods:hasSpecialAccessNeeds': specialAccessNeedsUris
              },
              contentType: MIME_TYPES.JSON,
              webId: 'system'
            })
          );
        }
      }

      await this.broker.call('ldp.resource.patch', {
        resourceUri: this.actor.id,
        triplesToAdd: accessNeedGroupsUris.map(uri =>
          triple(namedNode(this.actor.id), namedNode(INTEROP_PREFIX + 'hasAccessNeedGroup'), namedNode(uri))
        ),
        webId: 'system'
      });
    }
  }
};
