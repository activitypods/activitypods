const CESIUM_APP_URL = "https://demo.cesium.app/#/app/wot/";
const CESIUM_APP_REGEX = /^https:\/\/demo\.cesium\.app\/#\/app\/wot\/([^\\]*)\//;

export const g1PublicKeyToUrl = value => {
  if( value && !value.startsWith(CESIUM_APP_URL) ) {
    return CESIUM_APP_URL + value + '/';
  }
  return value;
}

export const g1UrlToPublicKey = value => {
  if( value && value.startsWith(CESIUM_APP_URL) ) {
    const results = value.match(CESIUM_APP_REGEX);
    if( results ) return results[1];
  }
  return value;
};

export const formatUsername = (uri) => {
  const url = new URL(uri);
  const username = url.pathname.split('/')[1];
  return '@' + username + '@' + url.host;
};
