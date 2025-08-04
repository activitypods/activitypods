// Read all .env* files in the root folder and add them to process.env
// See https://github.com/kerimdzhanov/dotenv-flow for more details
require('dotenv-flow').config();

export const INSTANCE_NAME = process.env.SEMAPPS_INSTANCE_NAME;

export const INSTANCE_DESCRIPTION = {
  en: process.env.SEMAPPS_INSTANCE_DESCRIPTION_EN || process.env.SEMAPPS_INSTANCE_DESCRIPTION,
  fr: process.env.SEMAPPS_INSTANCE_DESCRIPTION_FR
};

export const INSTANCE_OWNER = process.env.SEMAPPS_INSTANCE_OWNER;
export const INSTANCE_AREA = process.env.SEMAPPS_INSTANCE_AREA;
export const BASE_URL = process.env.SEMAPPS_HOME_URL;
export const PORT = process.env.SEMAPPS_PORT;
export const FRONTEND_URL = process.env.SEMAPPS_FRONTEND_URL;
export const SHAPE_REPOSITORY_URL = process.env.SEMAPPS_SHAPE_REPOSITORY_URL;
export const COLOR_PRIMARY = process.env.SEMAPPS_COLOR_PRIMARY;
export const COLOR_SECONDARY = process.env.SEMAPPS_COLOR_SECONDARY;
export const AVAILABLE_LOCALES = process.env.SEMAPPS_AVAILABLE_LOCALES.split(',');
export const DEFAULT_LOCALE = process.env.SEMAPPS_DEFAULT_LOCALE;
export const ENABLE_GROUPS = process.env.SEMAPPS_ENABLE_GROUPS === 'true';
export const MAPBOX_ACCESS_TOKEN = process.env.SEMAPPS_MAPBOX_ACCESS_TOKEN;
export const SPARQL_ENDPOINT = process.env.SEMAPPS_SPARQL_ENDPOINT;
export const JENA_USER = process.env.SEMAPPS_JENA_USER;
export const JENA_PASSWORD = process.env.SEMAPPS_JENA_PASSWORD;
export const FUSEKI_BASE = process.env.SEMAPPS_FUSEKI_BASE;
export const REDIS_CACHE_URL = process.env.SEMAPPS_REDIS_CACHE_URL;
export const REDIS_TRANSPORTER_URL = process.env.SEMAPPS_REDIS_TRANSPORTER_URL;
export const QUEUE_SERVICE_URL = process.env.SEMAPPS_QUEUE_SERVICE_URL;
export const REDIS_OIDC_PROVIDER_URL = process.env.SEMAPPS_REDIS_OIDC_PROVIDER_URL;
export const COOKIE_SECRET = process.env.SEMAPPS_COOKIE_SECRET;
export const FROM_EMAIL = process.env.SEMAPPS_FROM_EMAIL;
export const FROM_NAME = process.env.SEMAPPS_FROM_NAME;
export const SMTP_HOST = process.env.SEMAPPS_SMTP_HOST;
export const SMTP_PORT = parseInt(process.env.SEMAPPS_SMTP_PORT, 10);
export const SMTP_SECURE = process.env.SEMAPPS_SMTP_SECURE === 'true';
export const SMTP_USER = process.env.SEMAPPS_SMTP_USER;
export const SMTP_PASS = process.env.SEMAPPS_SMTP_PASS;
export const AUTH_RESERVED_USER_NAMES = process.env.SEMAPPS_AUTH_RESERVED_USER_NAMES.split(',');
export const AUTH_ACCOUNTS_DATASET = process.env.SEMAPPS_AUTH_ACCOUNTS_DATASET;
export const BACKUP_COPY_METHOD = process.env.SEMAPPS_BACKUP_COPY_METHOD;
export const BACKUP_SERVER_PATH = process.env.SEMAPPS_BACKUP_SERVER_PATH;
export const BACKUP_SERVER_HOST = process.env.SEMAPPS_BACKUP_SERVER_HOST;
export const BACKUP_SERVER_USER = process.env.SEMAPPS_BACKUP_SERVER_USER;
export const BACKUP_SERVER_PASSWORD = process.env.SEMAPPS_BACKUP_SERVER_PASSWORD;
export const BACKUP_SERVER_PORT = process.env.SEMAPPS_BACKUP_SERVER_PORT;
