// Read all .env* files in the root folder and add them to process.env
// See https://github.com/kerimdzhanov/dotenv-flow for more details
require('dotenv-flow').config();

module.exports = {
  SPARQL_ENDPOINT: process.env.SEMAPPS_SPARQL_ENDPOINT,
  JENA_USER: process.env.SEMAPPS_JENA_USER,
  JENA_PASSWORD: process.env.SEMAPPS_JENA_PASSWORD,
  FUSEKI_BASE: process.env.FUSEKI_BASE,
  SHAPE_REPOSITORY_URL: process.env.SEMAPPS_SHAPE_REPOSITORY_URL,
  MAILCATCHER_API_URL: process.env.SEMAPPS_MAILCATCHER_API_URL,
  QUEUE_SERVICE_URL: process.env.SEMAPPS_QUEUE_SERVICE_URL,
  REDIS_TRANSPORTER_URL: process.env.SEMAPPS_REDIS_TRANSPORTER_URL,
  REDIS_OIDC_PROVIDER_URL: process.env.SEMAPPS_REDIS_OIDC_PROVIDER_URL,
  FROM_EMAIL: process.env.SEMAPPS_FROM_EMAIL,
  FROM_NAME: process.env.SEMAPPS_FROM_NAME,
  SMTP_HOST: process.env.SEMAPPS_SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SEMAPPS_SMTP_PORT, 10),
  SMTP_SECURE: process.env.SEMAPPS_SMTP_SECURE === 'true',
  SMTP_USER: process.env.SEMAPPS_SMTP_USER,
  SMTP_PASS: process.env.SEMAPPS_SMTP_PASS
};
