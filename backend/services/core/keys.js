const path = require('path');
const { KeysService } = require('@semapps/crypto');

module.exports = {
  mixins: [KeysService],
  settings: {
    actorsKeyPairsDir: path.resolve(__dirname, '../../actors'), // Not necessary anymore ?
    podProvider: true
  }
};
