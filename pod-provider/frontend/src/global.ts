export {};

interface GlobalConfig {
  INSTANCE_NAME: string;
  INSTANCE_DESCRIPTION: string;
  DEFAULT_LOCALE: string;
  BACKEND_URL: string;
  MAPBOX_ACCESS_TOKEN: string;
  COLOR_PRIMARY: string;
  COLOR_SECONDARY: string;
}

declare global {
  var CONFIG: GlobalConfig;
}
