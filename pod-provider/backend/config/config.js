// Read all .env* files in the root folder and add them to process.env
// See https://github.com/kerimdzhanov/dotenv-flow for more details
require('dotenv-flow').config();

const path = require('path');

module.exports = {
  INSTANCE_NAME: process.env.SEMAPPS_INSTANCE_NAME,
  BASE_URL: process.env.SEMAPPS_HOME_URL,
  PORT: process.env.SEMAPPS_PORT,
  FRONTEND_URL: process.env.SEMAPPS_FRONTEND_URL,
  COLOR_PRIMARY: process.env.SEMAPPS_COLOR_PRIMARY,
  COLOR_SECONDARY: process.env.SEMAPPS_COLOR_SECONDARY,
  DEFAULT_LOCALE: process.env.SEMAPPS_DEFAULT_LOCALE,
  SPARQL_ENDPOINT: process.env.SEMAPPS_SPARQL_ENDPOINT,
  JENA_USER: process.env.SEMAPPS_JENA_USER,
  JENA_PASSWORD: process.env.SEMAPPS_JENA_PASSWORD,
  REDIS_CACHE_URL: process.env.SEMAPPS_REDIS_CACHE_URL,
  REDIS_TRANSPORTER_URL: process.env.SEMAPPS_REDIS_TRANSPORTER_URL,
  QUEUE_SERVICE_URL: process.env.SEMAPPS_QUEUE_SERVICE_URL,
  REDIS_OIDC_PROVIDER_URL: process.env.SEMAPPS_REDIS_OIDC_PROVIDER_URL,
  COOKIE_SECRET: process.env.SEMAPPS_COOKIE_SECRET,
  FROM_EMAIL: process.env.SEMAPPS_FROM_EMAIL,
  FROM_NAME: process.env.SEMAPPS_FROM_NAME,
  SMTP_HOST: process.env.SEMAPPS_SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SEMAPPS_SMTP_PORT, 10),
  SMTP_SECURE: process.env.SEMAPPS_SMTP_SECURE === 'true',
  SMTP_USER: process.env.SEMAPPS_SMTP_USER,
  SMTP_PASS: process.env.SEMAPPS_SMTP_PASS,
  BACKUP_SERVER_PATH: process.env.SEMAPPS_BACKUP_SERVER_PATH,
  /** @deprecated */
  BACKUP_FUSEKI_DATASETS_PATH: process.env.SEMAPPS_BACKUP_FUSEKI_DATASETS_PATH,
  FUSEKI_BASE: process.env.FUSEKI_BASE || path.join(process.env.SEMAPPS_BACKUP_FUSEKI_DATASETS_PATH || '', '..'),
  AUTH_RESERVED_USER_NAMES: process.env.SEMAPPS_AUTH_RESERVED_USER_NAMES.split(','),
  AUTH_ACCOUNTS_DATASET: process.env.SEMAPPS_AUTH_ACCOUNTS_DATASET
};
