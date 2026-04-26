const { WebAclMiddleware, CacherMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const AppControlMiddleware = require('./middlewares/app-control');
const HashtagNormalizationMiddleware = require('./middlewares/hashtag-normalization');
const TrustEvaluatorMiddleware = require('./middlewares/trust-evaluator');
const ContentWarningMiddleware = require('./middlewares/content-warning');
const LinkPreviewMiddleware = require('./middlewares/link-preview');
const LongFormTextMiddleware = require('./middlewares/long-form-text');
const MediaAttachmentsMiddleware = require('./middlewares/media-attachments');
const PollsMiddleware = require('./middlewares/polls');
const ReplyPoliciesMiddleware = require('./middlewares/reply-policies');
const SearchConsentMiddleware = require('./middlewares/search-consent');
const QuotePostsMiddleware = require('./middlewares/quote-posts');
const ActorMetadataMiddleware = require('./middlewares/actor-metadata');
const AuthorAttributionMiddleware = require('./middlewares/author-attribution');
const Fep4adbMiddleware = require('./middlewares/fep-4adb');
const Fep5bf0CollectionViewsMiddleware = require('./middlewares/fep-5bf0-collection-views');
const CONFIG = require('./config/config');
const errorHandler = require('./config/errorHandler');
const RdfJSONSerializer = require('./RdfJSONSerializer');

Error.stackTraceLimit = Infinity;

// Use the cacher only if Redis is configured
const cacherConfig = CONFIG.REDIS_CACHE_URL
  ? {
      type: 'Redis',
      options: {
        prefix: 'action',
        ttl: 2592000, // Keep in cache for one month
        redis: CONFIG.REDIS_CACHE_URL
      }
    }
  : undefined;

/** @type {import('moleculer').BrokerOptions} */
module.exports = {
  nodeID: 'pod-provider',
  // You can set all ServiceBroker configurations here
  // See https://moleculer.services/docs/0.14/configuration.html
  middlewares: [
    CacherMiddleware(cacherConfig), // Set the cacher before the WebAcl middleware
    WebAclMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true }),
    ObjectsWatcherMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true, postWithoutRecipients: true }),
    LongFormTextMiddleware(),
    ContentWarningMiddleware(),
    PollsMiddleware(),
    QuotePostsMiddleware(),
    ReplyPoliciesMiddleware(),
    ActorMetadataMiddleware(),
    AuthorAttributionMiddleware(),
    Fep4adbMiddleware(),
    Fep5bf0CollectionViewsMiddleware(CONFIG.BASE_URL),
    HashtagNormalizationMiddleware(),
    LinkPreviewMiddleware(),
    MediaAttachmentsMiddleware(),
    SearchConsentMiddleware(),
    TrustEvaluatorMiddleware(),
    AppControlMiddleware({ baseUrl: CONFIG.BASE_URL })
  ],
  errorHandler,
  logger: [
    {
      type: 'Console',
      options: {
        formatter: 'short',
        level: 'info'
      }
    },
    {
      type: 'File',
      options: {
        formatter: 'short',
        level: 'error',
        folder: './logs',
        filename: 'moleculer-errors-{date}.log'
      }
    }
  ],
  transporter: CONFIG.REDIS_TRANSPORTER_URL || undefined,
  serializer: CONFIG.REDIS_TRANSPORTER_URL ? new RdfJSONSerializer() : undefined
};
