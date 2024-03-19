const urlJoin = require('url-join');
const { getSlugFromUri } = require('@semapps/ldp');
const CONFIG = require('../config/config');

function getAclUriFromResourceUri(baseUrl, resourceUri) {
  return urlJoin(baseUrl, resourceUri.replace(baseUrl, baseUrl.endsWith('/') ? '_acl/' : '_acl'));
}

const replaceRules = {
  invitees: 'announces',
  inviters: 'announcers'
};

module.exports = {
  name: 'migration',
  actions: {
    async associateFrontAppRegistration(ctx) {
      const { domainName } = ctx.params;
      if (!domainName) throw new Error('Missing parameter domainName');
      for (let dataset of await ctx.call('pod.list')) {
        this.logger.info(`Associating apods:FrontAppRegistration type with app.armoise.co for dataset ${dataset}...`);
        await ctx.call('triplestore.update', {
          query: `
            DELETE { 
              ?s <http://activitypods.org/ns/core#preferredForTypes> <http://activitypods.org/ns/core#FrontAppRegistration> . 
            }
            INSERT { 
              ?s <http://activitypods.org/ns/core#preferredForTypes> <http://activitypods.org/ns/core#FrontAppRegistration> . 
            }
            WHERE { 
              ?s <http://activitypods.org/ns/core#domainName> "${domainName}" .
            }
          `,
          dataset,
          webId: 'system'
        });
      }
    },
    async fixFilesType(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        this.logger.info(`Fixing semapps:File type for dataset ${dataset}...`);
        await ctx.call('triplestore.update', {
          query: `
          DELETE { ?s a <semapps:File> . }
          INSERT { ?s a <http://semapps.org/ns/core#File> . }
          WHERE { ?s a <semapps:File> . }
          `,
          dataset,
          webId: 'system'
        });
      }
    },
    async createAndAttachIgnoredContacts(ctx) {
      const registeredCollections = await ctx.call('activitypub.registry.list');
      const ignoredContactsCollection = registeredCollections.find(c => c.name === '/ignored-contacts');
      for (let dataset of await ctx.call('pod.list')) {
        ctx.meta.dataset = dataset;
        const actorUri = urlJoin(CONFIG.HOME_URL, dataset);
        this.logger.info(`Adding /ignored-contacts collection to actor ${actorUri}...`);
        await ctx.call('activitypub.registry.createAndAttachCollection', {
          objectUri: actorUri,
          collection: ignoredContactsCollection,
          webId: 'system'
        });
      }
    },
    async giveReadRightsToSkillContainer(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        const [account] = await ctx.call('auth.account.find', { query: { username: dataset } });
        if (account) {
          this.logger.info(`Giving rights for ${account.webId}`);
          await ctx.call(
            'lacartedessavoirs.skill.giveReadRightsToContacts',
            { webId: account.webId },
            { meta: { dataset } }
          );
        } else {
          this.logger.warn(`No account with dataset ${dataset}`);
        }
      }
    },
    async fixSyreenPredicate(ctx) {
      const predicates = ['phase', 'status', 'type', 'quantity', 'unit'];
      for (let predicate of predicates) {
        this.logger.info('Fixing predicate syreen:' + predicate);
        await ctx.call('triplestore.update', {
          query: `
            DELETE {
              ?subject <syreen:${predicate}> ?object
            }
            INSERT {
              ?subject <http://syreen.fr/ns/core#${predicate}> ?object
            }
            WHERE {
              ?subject <syreen:${predicate}> ?object
            }
          `,
          dataset: '*',
          webId: 'system'
        });
      }
    },
    async useApplicationJson(ctx) {
      const appsDomains = [
        'lentraide.app',
        'bienvenuechezmoi.org',
        'welcometomyplace.org',
        'mutual-aid.app',
        'mastopod.com'
      ];
      for (let domain of appsDomains) {
        this.logger.info(`Moving app registrations for domain ${domain}...`);
        await ctx.call('triplestore.update', {
          query: `
            DELETE {
              ?appReg <http://activitypods.org/ns/core#application> <https://data.activitypods.org/trusted-apps/${domain}> .
            }
            INSERT {
              ?appReg <http://activitypods.org/ns/core#application> <https://${domain}/application.json> .
            }
            WHERE {
              ?appReg <http://activitypods.org/ns/core#application> <https://data.activitypods.org/trusted-apps/${domain}> .
            }
          `,
          dataset: '*',
          webId: 'system'
        });
      }
    },
    async migrate(ctx) {
      const { version } = ctx.params;

      if (version === '1.1.0') {
        for (let dataset of await ctx.call('pod.list')) {
          const [account] = await ctx.call('auth.account.find', { query: { username: dataset } });

          // TODO compare if version is greater than account version
          if (account.version !== version) {
            this.logger.info(`Migrating dataset ${dataset} to v${version}...`);

            for (let [from, to] of Object.entries(replaceRules)) {
              await ctx.call('migration.replacePredicate', {
                oldPredicate: 'http://activitypods.org/ns/core#' + from,
                newPredicate: 'http://activitypods.org/ns/core#' + to,
                dataset
              });
            }

            const resources = await ctx.call('ldp.container.getUris', {
              containerUri: urlJoin(CONFIG.HOME_URL, dataset, 'data', 'events')
            });
            for (let resourceUri of resources) {
              const resourceSlug = getSlugFromUri(resourceUri);

              for (let [from, to] of Object.entries(replaceRules)) {
                await ctx.call('migration.moveResource', {
                  oldResourceUri: urlJoin(resourceUri, from),
                  newResourceUri: urlJoin(resourceUri, to),
                  dataset
                });

                await ctx.call('migration.moveAclGroup', {
                  oldGroupUri: urlJoin(CONFIG.HOME_URL, '_groups', dataset, 'data', 'events', resourceSlug, from),
                  newGroupUri: urlJoin(CONFIG.HOME_URL, '_groups', dataset, 'data', 'events', resourceSlug, to),
                  dataset
                });
              }
            }

            await ctx.call('auth.account.update', {
              '@id': account['@id'],
              version
            });

            this.logger.info('Done !');
          } else {
            this.logger.warn(`Dataset ${dataset} is already on v${version}, skipping...`);
          }
        }
      }
    },
    async replacePredicate(ctx) {
      const { oldPredicate, newPredicate, dataset } = ctx.params;

      this.logger.info(`Replacing predicate ${oldPredicate} to ${newPredicate}...`);

      await ctx.call('triplestore.update', {
        query: `
          DELETE { ?s <${oldPredicate}> ?o . }
          INSERT { ?s <${newPredicate}> ?o . }
          WHERE { ?s <${oldPredicate}> ?o . }
        `,
        dataset,
        webId: 'system'
      });
    },
    async moveResource(ctx) {
      const { oldResourceUri, newResourceUri, dataset } = ctx.params;

      this.logger.info(`Moving resource ${oldResourceUri} to ${newResourceUri}...`);

      await ctx.call('triplestore.update', {
        query: `
          DELETE { <${oldResourceUri}> ?p ?o  }
          INSERT { <${newResourceUri}> ?p ?o }
          WHERE { <${oldResourceUri}> ?p ?o }
        `,
        dataset,
        webId: 'system'
      });

      await ctx.call('triplestore.update', {
        query: `
          DELETE { ?s ?p <${oldResourceUri}> }
          INSERT { ?s ?p <${newResourceUri}> }
          WHERE { ?s ?p <${oldResourceUri}> }
        `,
        dataset,
        webId: 'system'
      });

      await ctx.call('triplestore.update', {
        query: `
          WITH <http://semapps.org/webacl>
          DELETE { ?s ?p <${oldResourceUri}> }
          INSERT { ?s ?p <${newResourceUri}> }
          WHERE { ?s ?p <${oldResourceUri}> }
        `,
        dataset,
        webId: 'system'
      });

      await ctx.call('migration.moveAclRights', { newResourceUri, oldResourceUri, dataset });
    },
    async moveAclGroup(ctx) {
      const { oldGroupUri, newGroupUri, dataset } = ctx.params;

      this.logger.info(`Moving ACL group ${oldGroupUri} to ${newGroupUri}...`);

      await ctx.call('triplestore.update', {
        query: `
          WITH <http://semapps.org/webacl>
          DELETE { <${oldGroupUri}> ?p ?o }
          INSERT { <${newGroupUri}> ?p ?o }
          WHERE { <${oldGroupUri}> ?p ?o }
        `,
        dataset,
        webId: 'system'
      });

      await ctx.call('triplestore.update', {
        query: `
          WITH <http://semapps.org/webacl>
          DELETE { ?s ?p <${oldGroupUri}> }
          INSERT { ?s ?p <${newGroupUri}> }
          WHERE { ?s ?p <${oldGroupUri}> }
        `,
        dataset,
        webId: 'system'
      });

      await ctx.call('migration.moveAclRights', { newResourceUri: newGroupUri, oldResourceUri: oldGroupUri, dataset });
    },
    async moveAclRights(ctx) {
      const { oldResourceUri, newResourceUri, dataset } = ctx.params;

      for (let right of ['Read', 'Append', 'Write', 'Control']) {
        const oldResourceAclUri = getAclUriFromResourceUri(CONFIG.HOME_URL, oldResourceUri) + '#' + right;
        const newResourceAclUri = getAclUriFromResourceUri(CONFIG.HOME_URL, newResourceUri) + '#' + right;

        this.logger.info(`Moving ACL rights ${oldResourceAclUri} to ${newResourceAclUri}...`);

        await ctx.call('triplestore.update', {
          query: `
            WITH <http://semapps.org/webacl>
            DELETE { <${oldResourceAclUri}> ?p ?o }
            INSERT { <${newResourceAclUri}> ?p ?o }
            WHERE { <${oldResourceAclUri}> ?p ?o }
          `,
          dataset,
          webId: 'system'
        });
      }
    }
  }
};
