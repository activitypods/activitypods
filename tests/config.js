// Read all .env* files in the root folder and add them to process.env
// See https://github.com/kerimdzhanov/dotenv-flow for more details
require('dotenv-flow').config();

module.exports = {
  HOME_URL: process.env.SEMAPPS_HOME_URL,
  SPARQL_ENDPOINT: process.env.SEMAPPS_SPARQL_ENDPOINT,
  JENA_USER: process.env.SEMAPPS_JENA_USER,
  JENA_PASSWORD: process.env.SEMAPPS_JENA_PASSWORD
};
