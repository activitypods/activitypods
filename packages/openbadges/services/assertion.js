const sharp = require("sharp");
const pngitxt = require('png-itxt');
const urlJoin = require('url-join');
const { Readable } = require('stream');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'openbadges.assertion',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/assertions',
    acceptedTypes: [
      'obi:Assertion',
    ],
    dereference: ['obi:recipient', 'obi:verify'],
    permissions: {},
    newResourcesPermissions: {},
  },
  hooks: {
    after: {
      async create(ctx, res) {
        const { resourceUri: assertionUri, newData: assertion, webId } = res;

        console.log('assertion', assertion);

        const badge = await ctx.call('ldp.resource.get', {
          resourceUri: assertion.badge,
          accept: MIME_TYPES.JSON,
          webId
        });

        console.log('badge', badge)

        const badgeImage = await ctx.call('ldp.resource.get', {
          resourceUri: badge['schema:image'],
          forceSemantic: true,
          accept: MIME_TYPES.JSON,
          webId
        });

        console.log('badgeImage', badgeImage)

        const bakedBadgeUri = await ctx.call('ldp.resource.generateId', {
          containerUri: urlJoin(webId, 'data', 'baked-badges')
        })

        console.log('bakedBadgeUri', bakedBadgeUri);

        const framedAssertion = await ctx.call('jsonld.frame', {
          input: {
            ...assertion,
            'schema:image': {
              '@id': bakedBadgeUri
            }
          },
          frame: {
            '@context': 'https://openbadgespec.org/v2/context.json',
            '@id': assertionUri
          }
        });

        console.log('framedAssertion', framedAssertion);

        const buffer = await sharp('./' + badgeImage['semapps:localPath']).png().toBuffer();
        const readableStream = Readable.from(buffer);
        const bakedFileStream = await readableStream.pipe(pngitxt.set({ keyword: 'openbadge', value: JSON.stringify(framedAssertion)} ));

        console.log('bakedFileStream', bakedFileStream);

        await ctx.call('ldp.resource.upload', {
          resourceUri: bakedBadgeUri,
          file: {
            encoding: badgeImage['semapps:encoding'],
            mimeType: badgeImage['semapps:mimeType'],
            readableStream: bakedFileStream,
          }
        })

        // TODO PATCH assertion with image

        return {
          resourceUri: assertionUri,
          newData: {
            ...assertion,
            'schema:image': bakedBadgeUri
          },
          webId
        }
      },
    },
  },
};
