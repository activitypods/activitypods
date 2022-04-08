import path from "path";

const delay = (t) => new Promise((resolve) => setTimeout(resolve, t));

const getAnnouncedGroupUri = eventUri => {
  const uri = new URL(eventUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/announced');
  return uri.toString();
};

const getAnnouncersGroupUri = eventUri => {
  const uri = new URL(eventUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/announcers');
  return uri.toString();
};

module.exports = {
  delay,
  getAnnouncedGroupUri,
  getAnnouncersGroupUri
};
