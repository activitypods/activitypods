const path = require('path');
const { KeysService } = require('@semapps/crypto');

module.exports = {
  mixins: [KeysService],
  settings: {
    podProvider: true
  }
};
