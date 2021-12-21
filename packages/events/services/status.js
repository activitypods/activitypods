const CronMixin = require('moleculer-cron');
const { MIME_TYPES } = require('@semapps/mime-types');
const { defaultToArray } = require('@semapps/ldp');

const EVENT_STATUS_COMING = 'apods:Coming';
const EVENT_STATUS_FINISHED = 'apods:Finished';
const EVENT_STATUS_OPEN = 'apods:Open';
const EVENT_STATUS_CLOSED = 'apods:Closed';

module.exports = {
  name: 'events.status',
  mixins: [CronMixin],
  dependencies: ['api', 'ldp', 'webacl'],
  actions: {
    async set(ctx) {
      const { eventUri, newStatus } = ctx.params;
      let event = await ctx.call('events.event.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON,
        webId: 'system',
      });

      await ctx.call('events.event.put', {
        resource: { ...event, 'apods:hasStatus': newStatus },
        contentType: MIME_TYPES.JSON,
        webId: 'system',
      });
    },
    isFinished(ctx) {
      const { event } = ctx.params;
      const status = defaultToArray(event['apods:hasStatus']) || [];
      return status.includes(EVENT_STATUS_FINISHED);
    },
    isClosed(ctx) {
      const { event } = ctx.params;
      const status = defaultToArray(event['apods:hasStatus']) || [];
      return status.includes(EVENT_STATUS_CLOSED);
    },
    async tagNewEvent(ctx) {
      const { eventUri } = ctx.params;
      // TODO ensure that the event is indeed coming and open
      await this.actions.set({ eventUri, newStatus: [EVENT_STATUS_COMING, EVENT_STATUS_OPEN] });
    },
    async tagComing(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX apods: <http://activitypods.org/ns/core#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            SELECT ?eventUri
            WHERE {
              ?eventUri a as:Event .
              ?eventUri as:endTime ?endTime .
              FILTER(NOW() < ?endTime) .
              FILTER NOT EXISTS { ?eventUri apods:hasStatus ${EVENT_STATUS_COMING} . }
            }
          `,
          dataset,
          webId: 'system',
        });

        for (let eventUri of results.map((node) => node.eventUri.value)) {
          await this.actions.set({ eventUri, newStatus: [EVENT_STATUS_COMING, EVENT_STATUS_OPEN] });
          await ctx.emit('events.status.coming', { eventUri });
        }
      }
    },
    async tagClosed(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX apods: <http://activitypods.org/ns/core#>
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            SELECT ?eventUri
            WHERE {
              ?eventUri a as:Event .
              ?eventUri as:endTime ?endTime .
              OPTIONAL { ?eventUri apods:closingTime ?closingTime }
              OPTIONAL { ?eventUri apods:maxAttendees ?maxAttendees }
              # Subquery to count participants
              {
                SELECT (COUNT(?attendees) AS ?numAttendees) ?eventUri
                WHERE { 
                  ?eventUri apods:attendees ?attendeesCollectionUri .
                  ?attendeesCollectionUri as:items ?attendees
                } 
                GROUP BY ?eventUri
              }
              FILTER(( NOW() > ?closingTime && NOW() < ?endTime ) || (NOW() < ?endTime && ?numAttendees >= ?maxAttendees)) .
              FILTER NOT EXISTS { ?eventUri apods:hasStatus ${EVENT_STATUS_CLOSED} . }
            }
          `,
          dataset,
          webId: 'system',
        });

        for (let eventUri of results.map((node) => node.eventUri.value)) {
          await this.actions.set({ eventUri, newStatus: [EVENT_STATUS_COMING, EVENT_STATUS_CLOSED] });
          await ctx.emit('events.status.closed', { eventUri });
        }
      }
    },
    async tagFinished(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX apods: <http://activitypods.org/ns/core#>
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            SELECT ?eventUri
            WHERE {
              ?eventUri a as:Event .
              ?eventUri as:endTime ?endTime .
              FILTER(NOW() > ?endTime) .
              FILTER NOT EXISTS { ?eventUri apods:hasStatus ${EVENT_STATUS_FINISHED} . }
            }
          `,
          dataset,
          webId: 'system',
        });

        for (let eventUri of results.map((node) => node.eventUri.value)) {
          await this.actions.set({ eventUri, newStatus: [EVENT_STATUS_FINISHED, EVENT_STATUS_CLOSED] });
          await ctx.emit('events.status.finished', { eventUri });
        }
      }
    },
  },
  crons: [
    {
      cronTime: '*/15 * * * *',
      onTick: function () {
        this.call('events.status.tagComing');
        this.call('events.status.tagClosed');
        this.call('events.status.tagFinished');
      },
      timeZone: 'Europe/Paris',
    },
  ],
};
