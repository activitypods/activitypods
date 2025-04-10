const urlJoin = require('url-join');
const { AppService } = require('../../app-framework/app');
const CONFIG = require('../config');

module.exports = {
  mixins: [AppService],
  settings: {
    app: {
      name: 'Example 2 App',
      description: 'Another ActivityPods app for integration tests'
    },
    accessNeeds: {
      required: [
        {
          shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
          accessMode: ['acl:Read', 'acl:Write']
        }
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
