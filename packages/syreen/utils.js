const path = require("path");

const getSyreenAclGroupUri = (actorUri) => {
  const uri = new URL(actorUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/syreen');
  return uri.toString();
};

module.exports = {
  getSyreenAclGroupUri
};
