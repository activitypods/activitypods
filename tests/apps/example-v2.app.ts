import urlJoin from 'url-join';
import { AppService } from '../../app-framework/app/index.ts';
import * as CONFIG from '../config.ts';

const Schema = {
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

export default Schema;
