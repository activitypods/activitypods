const { ProxyService } = require('@semapps/crypto');

module.exports = {
  mixins: [ProxyService],
  settings: {
    podProvider: true
  }
};
