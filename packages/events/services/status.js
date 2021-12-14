const CronMixin = require("moleculer-cron");
const { MIME_TYPES } = require("@semapps/mime-types");
const { defaultToArray } = require("@semapps/ldp")

module.exports = {
  name: 'events.status',
  mixins: [CronMixin],
  settings: {
    status: {
      // Event in the future or already finished ?
      coming: null,
      finished: null,
      // Subscriptions open or not ?
      open: null,
      closed: null,
    }
  },
  dependencies: ['api', 'ldp', 'webacl'],
  actions: {
    async set(ctx) {
      const { eventUri, newStatus } = ctx.params;
      let event = await ctx.call('events.event.get', { resourceUri: eventUri, accept: MIME_TYPES.JSON, webId: 'system' });

      await ctx.call('events.event.put', {
        resource: { ...event, 'pair:hasStatus': newStatus },
        contentType: MIME_TYPES.JSON,
        webId: 'system'
      });
    },
    isFinished(ctx) {
      const { event } = ctx.params;
      const status = defaultToArray(event['pair:hasStatus']) || [];
      return status.includes(this.settings.status.finished)
    },
    isClosed(ctx) {
      const { event } = ctx.params;
      const status = defaultToArray(event['pair:hasStatus']) || [];
      return status.includes(this.settings.status.closed)
    },
    async tagNewEvent(ctx) {
      const { eventUri } = ctx.params;
      // TODO ensure that the event is indeed coming and open
      await this.actions.set({ eventUri, newStatus: [this.settings.status.coming, this.settings.status.open] });
    },
    async tagComing(ctx) {
      for( let dataset of await ctx.call('pod.list') ) {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX apods: <http://activitypods.org/ns/core#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            PREFIX pair:  <http://virtual-assembly.org/ontologies/pair#>
            SELECT ?eventUri
            WHERE {
              ?eventUri a as:Event .
              ?eventUri as:endTime ?endTime .
              FILTER(NOW() < ?endTime) .
              FILTER NOT EXISTS { ?eventUri pair:hasStatus <${this.settings.status.coming}> . }
            }
          `,
          dataset,
          webId: 'system'
        });

        for (let eventUri of results.map(node => node.eventUri.value)) {
          await this.actions.set({ eventUri, newStatus: [this.settings.status.coming, this.settings.status.open] })
          await ctx.emit('event.status.coming', { eventUri });
        }
      }
    },
    async tagClosed(ctx) {
      for( let dataset of await ctx.call('pod.list') ) {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX apods: <http://activitypods.org/ns/core#>
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            PREFIX pair:  <http://virtual-assembly.org/ontologies/pair#>
            SELECT ?eventUri
            WHERE {
              ?eventUri a as:Event .
              ?eventUri as:endTime ?endTime .
              ?eventUri apods:closingTime ?closingTime .
              ?eventUri apods:maxAttendees ?maxAttendees .
              # Subquery to count participants
              {
                SELECT (COUNT(?attendees) AS ?numAttendees) ?eventUri
                WHERE { 
                  ?eventUri apods:attendees ?attendeesCollectionUri
                  ?attendeesCollectionUri as:items ?attendees
                } 
                GROUP BY ?eventUri
              }
              FILTER(( NOW() > ?closingTime && NOW() < ?endTime ) || (NOW() < ?endTime && ?numAttendees >= ?maxAttendees)) .
              FILTER NOT EXISTS { ?eventUri pair:hasStatus <${this.settings.status.closed}> . }
            }
          `,
          dataset,
          webId: 'system'
        });

        for (let eventUri of results.map(node => node.eventUri.value)) {
          await this.actions.set({ eventUri, newStatus: [this.settings.status.coming, this.settings.status.closed] })
          await ctx.emit('event.status.closed', { eventUri });
        }
      }
    },
    async tagFinished(ctx) {
      for( let dataset of await ctx.call('pod.list') ) {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            SELECT ?eventUri
            WHERE {
              ?eventUri a as:Event .
              ?eventUri as:endTime ?endTime .
              FILTER(NOW() > ?endTime) .
              FILTER NOT EXISTS { ?eventUri pair:hasStatus <${this.settings.status.finished}> . }
            }
          `,
          dataset,
          webId: 'system'
        });

        for( let eventUri of results.map(node => node.eventUri.value)) {
          await this.actions.set({ eventUri, newStatus: [this.settings.status.finished, this.settings.status.closed]})
          await ctx.emit('event.status.finished', { eventUri });
        }
      }
    }
  },
  crons: [
    {
      cronTime: '*/15 * * * *',
      onTick: function() {
        // this.call('event.status.tagComing');
        // this.call('event.status.tagClosed');
        // this.call('event.status.tagFinished');
      },
      timeZone: 'Europe/Paris'
    },
  ]
};
