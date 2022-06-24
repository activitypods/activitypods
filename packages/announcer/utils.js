const path = require('path');

const delay = (t) => new Promise((resolve) => setTimeout(resolve, t));

const getAnnouncesGroupUri = (eventUri) => {
  const uri = new URL(eventUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/announces');
  return uri.toString();
};

const getAnnouncersGroupUri = (eventUri) => {
  const uri = new URL(eventUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/announcers');
  return uri.toString();
};

module.exports = {
  delay,
  getAnnouncesGroupUri,
  getAnnouncersGroupUri,
};
