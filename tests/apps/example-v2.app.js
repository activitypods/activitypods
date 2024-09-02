const { AppService } = require('../../app-framework/app');
const { AS_PREFIX } = require('@semapps/activitypub');

module.exports = {
  mixins: [AppService],
  settings: {
    app: {
      name: 'Example App v2',
      description: 'An ActivityPods app for integration tests'
    },
    accessNeeds: {
      required: [
        {
          registeredClass: AS_PREFIX + 'Event',
          accessMode: ['acl:Read', 'acl:Write']
        },
        'apods:ReadInbox',
        'apods:ReadOutbox',
        'apods:PostOutbox',
        'apods:QuerySparqlEndpoint',
        'apods:CreateWacGroup',
        'apods:CreateCollection'
      ],
      optional: [
        {
          registeredClass: AS_PREFIX + 'Place',
          accessMode: ['acl:Read', 'acl:Append']
        }
      ]
    },
    classDescriptions: {
      'as:Event': {
        label: {
          en: 'Meetings',
          fr: 'Rencontres'
        },
        labelPredicate: 'as:name',
        openEndpoint: 'https://example.app/redirect'
      }
    }
  }
};
