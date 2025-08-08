// Read all .env* files in the root folder and add them to process.env
// See https://github.com/kerimdzhanov/dotenv-flow for more details
require('dotenv-flow').config();

export const SPARQL_ENDPOINT = process.env.SEMAPPS_SPARQL_ENDPOINT;
export const JENA_USER = process.env.SEMAPPS_JENA_USER;
export const JENA_PASSWORD = process.env.SEMAPPS_JENA_PASSWORD;
export const FUSEKI_BASE = process.env.FUSEKI_BASE;
export const SHAPE_REPOSITORY_URL = process.env.SEMAPPS_SHAPE_REPOSITORY_URL;
export const MAILCATCHER_API_URL = process.env.SEMAPPS_MAILCATCHER_API_URL;
export const QUEUE_SERVICE_URL = process.env.SEMAPPS_QUEUE_SERVICE_URL;
export const REDIS_TRANSPORTER_URL = process.env.SEMAPPS_REDIS_TRANSPORTER_URL;
export const REDIS_OIDC_PROVIDER_URL = process.env.SEMAPPS_REDIS_OIDC_PROVIDER_URL;
export const FROM_EMAIL = process.env.SEMAPPS_FROM_EMAIL;
export const FROM_NAME = process.env.SEMAPPS_FROM_NAME;
export const SMTP_HOST = process.env.SEMAPPS_SMTP_HOST;
export const SMTP_PORT = parseInt(process.env.SEMAPPS_SMTP_PORT, 10);
export const SMTP_SECURE = process.env.SEMAPPS_SMTP_SECURE === 'true';
export const SMTP_USER = process.env.SEMAPPS_SMTP_USER;
export const SMTP_PASS = process.env.SEMAPPS_SMTP_PASS;
