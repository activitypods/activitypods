const urlJoin = require('url-join');
const { AppService } = require('../../app-framework/app');
const CONFIG = require('../config');

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
          shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
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
          shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location'),
          accessMode: ['acl:Read', 'acl:Append']
        }
      ]
    }
  }
};
