const sharp = require("sharp");
const pngitxt = require('png-itxt');
const urlJoin = require('url-join');
const { Readable } = require('stream');
const { triple, namedNode } = require('@rdfjs/data-model');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'openbadges.assertion',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/assertions',
    acceptedTypes: ['Assertion'],
    dereference: ['obi:recipient', 'obi:verify'],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      key: 'new_event',
      title: {
        en: `{{emitterProfile.vcard:given-name}} awarded you a badge`,
        fr: `{{emitterProfile.vcard:given-name}} vous a accordé un badge`,
      },
    },
  },
  hooks: {
    after: {
      async create(ctx, res) {
        const { resourceUri: assertionUri, newData: assertion, webId } = res;

        const badge = await ctx.call('ldp.resource.get', {
          resourceUri: assertion.badge,
          accept: MIME_TYPES.JSON,
          webId
        });

        const badgeImage = await ctx.call('ldp.resource.get', {
          resourceUri: badge['schema:image'],
          forceSemantic: true,
          accept: MIME_TYPES.JSON,
          webId
        });

        const bakedBadgeContainerUri = urlJoin(webId, 'data', 'baked-badges');

        const bakedBadgeUri = await ctx.call('ldp.resource.generateId', {
          containerUri: bakedBadgeContainerUri
        })

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

        const buffer = await sharp('./' + badgeImage['semapps:localPath']).png().toBuffer();
        const readableStream = Readable.from(buffer);
        const bakedFileStream = await readableStream.pipe(pngitxt.set({ keyword: 'openbadge', value: JSON.stringify(framedAssertion)} ));

        // TODO see why we can't use ldp.container.post

        const bakedBadge = await ctx.call('ldp.resource.upload', {
          resourceUri: bakedBadgeUri,
          file: {
            encoding: badgeImage['semapps:encoding'],
            mimetype: badgeImage['semapps:mimeType'],
            readableStream: bakedFileStream,
          }
        });

        await ctx.call('triplestore.insert', {
          resource: `<${bakedBadgeContainerUri}> <http://www.w3.org/ns/ldp#contains> <${bakedBadgeUri}>`,
          webId
        });

        await ctx.call('ldp.resource.create', {
          resource: bakedBadge,
          contentType: MIME_TYPES.JSON,
          webId
        });

        await ctx.call('ldp.resource.patch', {
          resourceUri: assertionUri,
          triplesToAdd: [
            triple(
              namedNode(assertionUri),
              namedNode('http://schema.org/image'),
              namedNode(bakedBadgeUri)
            )
          ],
          webId
        });

        const updatedAssertion = await ctx.call('ldp.resource.get', {
          resourceUri: assertionUri,
          accept: MIME_TYPES.JSON,
          webId
        });

        return {
          resourceUri: assertionUri,
          newData: updatedAssertion,
          webId
        }
      },
    },
  },
};
