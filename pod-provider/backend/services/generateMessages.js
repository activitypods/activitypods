const { OBJECT_TYPES,ACTIVITY_TYPES } = require('@semapps/activitypub');

const getDatasetFromUri = uri => uri.split('/').pop();

module.exports = {
  name: 'generateMessages',
  actions: {
    /**
     * Generates a count messages from senderUro to recipientUri, starting the chain at number startingAt
     * With the particularity of adding an 'as:publishedTimestamp' field to the activity
     * Useful to create a largely filled collection and benchmark response time while sorting using 'as:published' or 'as:publishedTimestamp'
     *
     * e.g. from moleculer console
     * call generateMessages.generate
     *    --senderUri "http://localhost:3000/sylvain"
     *    --recipientUri "http://localhost:3000/johnny"
     *    --count 1
     *    --startingAt 1000
     */
    async generate(ctx) {

      const { senderUri, recipientUri, count, startingAt } = ctx.params;

      if (!senderUri || !recipientUri || !count) {
        throw new Error('Parameters senderUri, recipientUri and count are mandatory.');
      }

      const dataset = getDatasetFromUri(senderUri);

      this.logger.info(`Generating ${count} messages from ${senderUri} to ${recipientUri}...`);

      for (let i = startingAt || 1; i <= startingAt+(count-1); i++) {
        const messageContent = `Message ${i} from ${senderUri} to ${recipientUri}`;

        const activityObject = {
          type: OBJECT_TYPES.NOTE,
          content: messageContent,
        };

        const activity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: ACTIVITY_TYPES.CREATE,
          object: activityObject,
          to: recipientUri,
          'as:publishedTimestamp': Math.floor((new Date()).getTime() / 1000) // Timestamp
        };
        await ctx.call('activitypub.outbox.post', {
            collectionUri: `${senderUri}/outbox`,
            ...activity
          },
          {
            meta: {
              webId: senderUri,
              dataset: dataset
            }
          }
        );

        this.logger.info(`Message ${i} successfully sent`);
      }

      this.logger.info('Generation finished.');
    }
  }
};
