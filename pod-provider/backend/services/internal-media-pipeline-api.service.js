'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDatasetFromUri } = require('@semapps/ldp');
const { Errors: WebErrors } = require('moleculer-web');
const { MoleculerError } = require('moleculer').Errors;

const JSON_LD = 'application/ld+json';
const AS = 'https://www.w3.org/ns/activitystreams#';
const APODS = 'http://activitypods.org/ns/core#';
const SEMAPPS_FILE_TYPES = new Set([
  'semapps:File',
  'http://semapps.org/ns/core#File',
  'https://semapps.org/ns/core#File',
]);
const SAFETY_SIGNAL_SOURCES = new Set([
  'google-vision',
  'google-video',
  'safe-browsing',
  'cloudflare-csam',
]);
const MAX_SIGNAL_COUNT = 8;
const MAX_SIGNAL_LABELS = 16;
const MAX_SIGNAL_LABEL_LENGTH = 64;
const MAX_SIGNAL_RAW_BYTES = 2048;
const MEDIA_PIPELINE_CONTEXT = {
  apods: APODS,
  as: AS,
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  'apods:mediaPipelineSignalsUpdatedAt': { '@type': 'xsd:dateTime' },
  'apods:mediaPipelineModerationUpdatedAt': { '@type': 'xsd:dateTime' },
  'apods:mediaPipelineModerationConfidence': { '@type': 'xsd:double' },
};
const MEDIA_PIPELINE_PREDICATES = [
  `${AS}summary`,
  `${AS}sensitive`,
  `${APODS}mediaPipelineSignalsJson`,
  `${APODS}mediaPipelineSignalLabel`,
  `${APODS}mediaPipelineSignalSource`,
  `${APODS}mediaPipelineSignalsUpdatedAt`,
  `${APODS}mediaPipelineModerationModuleId`,
  `${APODS}mediaPipelineModerationTraceId`,
  `${APODS}mediaPipelineModerationMode`,
  `${APODS}mediaPipelineModerationDesiredAction`,
  `${APODS}mediaPipelineModerationAction`,
  `${APODS}mediaPipelineModerationLabel`,
  `${APODS}mediaPipelineModerationSource`,
  `${APODS}mediaPipelineModerationUpdatedAt`,
  `${APODS}mediaPipelineModerationConfidence`,
  `${APODS}mediaPipelineModerationReason`,
  `${APODS}mediaPipelineModerationContentWarning`,
];

module.exports = {
  name: 'internal-media-pipeline-api',

  dependencies: ['api'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || '',
    },
    routePath: '/api/internal/media-pipeline',
    baseUrl: String(process.env.SEMAPPS_HOME_URL || process.env.BASE_URL || '').replace(/\/$/, ''),
    allowedSourceOrigins: String(process.env.MEDIA_PIPELINE_ALLOWED_SOURCE_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    uploadsRoot: path.resolve(process.env.MEDIA_PIPELINE_UPLOADS_ROOT || path.join(process.cwd(), 'uploads')),
    maxSourceBytes: Number(process.env.MEDIA_PIPELINE_MAX_SOURCE_BYTES || 100 * 1024 * 1024),
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[InternalMediaPipelineApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'media-pipeline-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '512kb' } },
        onBeforeCall: (ctx, _route, req) => {
          const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          };
        },
        aliases: {
          'POST /resolve-source': 'internal-media-pipeline-api.resolveSource',
          'POST /assets': 'internal-media-pipeline-api.ingestAsset',
        },
      },
      toBottom: false,
    });

    this.logger.info('[InternalMediaPipelineApi] Internal routes registered under /api/internal/media-pipeline');
  },

  actions: {
    async resolveSource(ctx) {
      const sourceUrl = this.normalizeHttpUrl(ctx.params?.sourceUrl);
      if (!sourceUrl) {
        throw new MoleculerError('sourceUrl must be a valid http(s) URL', 400, 'INVALID_INPUT');
      }

      if (!this.isAllowedSourceOrigin(sourceUrl)) {
        throw new MoleculerError('sourceUrl must resolve to a trusted local ActivityPods origin', 403, 'FORBIDDEN');
      }

      const resource = await this.getFileResource(ctx, sourceUrl);
      const localPath = this.resolveLocalPath(resource);
      const stat = await fs.promises.stat(localPath);

      if (stat.size <= 0) {
        throw new MoleculerError('Resolved source file is empty', 404, 'NOT_FOUND');
      }
      if (stat.size > this.settings.maxSourceBytes) {
        throw new MoleculerError('Resolved source file exceeds the configured maximum', 422, 'PAYLOAD_TOO_LARGE');
      }

      const sniffBuffer = await this.readSniffBytes(localPath, 512);
      const headerMime = this.normalizeMimeType(
        resource['semapps:mimeType'] || resource.mediaType || resource.mimeType,
      );
      const mimeType = this.chooseMediaMimeType(headerMime, this.sniffMediaMimeType(sniffBuffer));
      if (!mimeType) {
        throw new MoleculerError('Resolved source file has an unsupported MIME type', 415, 'UNSUPPORTED_MEDIA_TYPE');
      }

      ctx.meta.$responseType = mimeType;
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Content-Length': String(stat.size),
        'Content-Disposition': 'inline',
      };

      return fs.createReadStream(localPath);
    },

    async ingestAsset(ctx) {
      const asset = this.normalizeAssetPayload(ctx.params?.asset);
      if (!asset) {
        throw new MoleculerError('asset payload is required', 400, 'INVALID_INPUT');
      }

      const activityPubBinding = this.normalizeActivityPubBinding(ctx.params?.bindings?.activitypub);
      const mediaPipelineSignals = this.normalizeSignals(ctx.params?.signals);
      const moderation = this.normalizeModerationDecision(ctx.params?.moderation);
      const candidateSourceUrls = this.resolveCandidateSourceUrls(asset);
      const updatedResources = [];
      const skippedResources = [];

      for (const sourceUrl of candidateSourceUrls) {
        if (!this.isAllowedSourceOrigin(sourceUrl)) {
          skippedResources.push({ sourceUrl, reason: 'untrusted_origin' });
          continue;
        }

        let existing;
        try {
          existing = await this.getFileResource(ctx, sourceUrl);
        } catch (error) {
          if (error && typeof error === 'object' && error.code === 404) {
            skippedResources.push({ sourceUrl, reason: 'not_found' });
            continue;
          }
          throw error;
        }

        const next = this.mergeMediaAsset(existing, asset, activityPubBinding, mediaPipelineSignals, moderation);
        await ctx.call('ldp.resource.put', {
          resourceUri: sourceUrl,
          resource: next,
          contentType: JSON_LD,
          webId: 'system',
        });
        await this.persistMediaPipelineMetadata(ctx, sourceUrl, asset, mediaPipelineSignals, moderation);

        updatedResources.push(sourceUrl);
      }

      ctx.meta.$statusCode = 202;
      return {
        ok: true,
        assetId: asset.assetId,
        signalCount: mediaPipelineSignals.length,
        moderationAction: moderation?.appliedAction || 'accept',
        updatedCount: updatedResources.length,
        updatedResources,
        skippedCount: skippedResources.length,
        skippedResources,
      };
    },
  },

  methods: {
    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      return match ? match[1] : null;
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), 'utf8');
      const got = Buffer.from(String(provided), 'utf8');
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      return exp.length === got.length && crypto.timingSafeEqual(expPadded, gotPadded);
    },

    normalizeHttpUrl(value) {
      if (!value || typeof value !== 'string') return null;
      try {
        const parsed = new URL(value);
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
          return null;
        }
        return parsed.toString();
      } catch {
        return null;
      }
    },

    isAllowedSourceOrigin(sourceUrl) {
      const parsed = new URL(sourceUrl);
      const allowedOrigins = new Set(this.settings.allowedSourceOrigins);
      if (this.settings.baseUrl) {
        allowedOrigins.add(new URL(this.settings.baseUrl).origin);
      }
      return allowedOrigins.has(parsed.origin);
    },

    async getFileResource(ctx, resourceUri) {
      const resource = await ctx.call('ldp.resource.get', {
        resourceUri,
        accept: JSON_LD,
        webId: 'system',
      });

      const rawTypes = Array.isArray(resource?.type)
        ? resource.type
        : Array.isArray(resource?.['@type'])
          ? resource['@type']
          : resource?.type || resource?.['@type']
            ? [resource.type || resource['@type']]
            : [];

      const normalizedTypes = rawTypes
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);

      if (!normalizedTypes.some(type => SEMAPPS_FILE_TYPES.has(type))) {
        throw new MoleculerError('Resource is not a SemApps file', 422, 'UNSUPPORTED_MEDIA_TYPE');
      }

      return resource;
    },

    resolveLocalPath(resource) {
      const localPath = typeof resource?.['semapps:localPath'] === 'string'
        ? resource['semapps:localPath']
        : null;
      if (!localPath) {
        throw new MoleculerError('Resolved file resource is missing semapps:localPath', 422, 'INVALID_RESOURCE');
      }

      const resolvedPath = path.resolve(localPath);
      const relativeToUploads = path.relative(this.settings.uploadsRoot, resolvedPath);
      if (
        relativeToUploads === '' ||
        relativeToUploads.startsWith('..') ||
        path.isAbsolute(relativeToUploads)
      ) {
        throw new MoleculerError('Resolved file path is outside the configured uploads root', 403, 'FORBIDDEN');
      }

      return resolvedPath;
    },

    async readSniffBytes(filePath, maxBytes) {
      const handle = await fs.promises.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },

    normalizeMimeType(value) {
      if (typeof value !== 'string' || !value.trim()) return null;
      return value.split(';')[0].trim().toLowerCase();
    },

    sniffMediaMimeType(buffer) {
      const b = buffer;
      if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
      if (
        b.length >= 8 &&
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a
      ) return 'image/png';
      if (b.length >= 6) {
        const signature = b.subarray(0, 6).toString('ascii');
        if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
      }
      if (
        b.length >= 12 &&
        b.subarray(0, 4).toString('ascii') === 'RIFF' &&
        b.subarray(8, 12).toString('ascii') === 'WEBP'
      ) return 'image/webp';
      if (b.length >= 12 && b.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brand = b.subarray(8, 12).toString('ascii');
        return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
      }
      if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
      return null;
    },

    chooseMediaMimeType(headerMime, sniffedMime) {
      if (
        sniffedMime &&
        headerMime &&
        headerMime !== 'application/octet-stream' &&
        sniffedMime !== headerMime
      ) {
        return null;
      }

      const candidate = sniffedMime || headerMime;
      if (!candidate) return null;
      return /^(image|video)\//.test(candidate) ? candidate : null;
    },

    normalizeAssetPayload(asset) {
      if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return null;
      if (typeof asset.assetId !== 'string' || !asset.assetId.trim()) return null;
      if (typeof asset.ownerId !== 'string' || !asset.ownerId.trim()) return null;
      if (typeof asset.canonicalUrl !== 'string' || !this.normalizeHttpUrl(asset.canonicalUrl)) return null;
      if (typeof asset.mimeType !== 'string' || !asset.mimeType.trim()) return null;
      return asset;
    },

    normalizeActivityPubBinding(binding) {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return null;
      const url = this.normalizeHttpUrl(binding.url);
      if (!url || typeof binding.mediaType !== 'string' || !binding.mediaType.trim()) {
        return null;
      }

      return {
        url,
        mediaType: binding.mediaType.trim(),
      };
    },

    normalizeSignals(signals) {
      if (!Array.isArray(signals)) {
        return [];
      }

      const normalized = [];

      for (const signal of signals) {
        if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
          continue;
        }

        const source = typeof signal.source === 'string' ? signal.source.trim().toLowerCase() : '';
        if (!SAFETY_SIGNAL_SOURCES.has(source)) {
          continue;
        }

        const labels = [...new Set(
          (Array.isArray(signal.labels) ? signal.labels : [])
            .map(label => this.normalizeSignalLabel(label))
            .filter(Boolean)
        )].slice(0, MAX_SIGNAL_LABELS);

        const next = {
          source,
          labels,
        };

        if (typeof signal.confidence === 'number' && Number.isFinite(signal.confidence)) {
          next.confidence = Math.max(0, Math.min(1, signal.confidence));
        }

        const raw = this.normalizeSignalRaw(signal.raw);
        if (raw !== undefined) {
          next.raw = raw;
        }

        normalized.push(next);
        if (normalized.length >= MAX_SIGNAL_COUNT) {
          break;
        }
      }

      return normalized;
    },

    normalizeModerationDecision(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
      }

      const desiredAction = typeof value.desiredAction === 'string' ? value.desiredAction.trim().toLowerCase() : 'accept';
      const appliedAction = typeof value.appliedAction === 'string' ? value.appliedAction.trim().toLowerCase() : 'accept';
      const moduleId = typeof value.moduleId === 'string' ? value.moduleId.trim() : '';
      const traceId = typeof value.traceId === 'string' ? value.traceId.trim() : '';

      if (!moduleId || !traceId) {
        return null;
      }

      const moderation = {
        moduleId,
        traceId,
        mode: typeof value.mode === 'string' ? value.mode.trim().toLowerCase() : 'dry-run',
        desiredAction: ['accept', 'label', 'filter', 'reject'].includes(desiredAction) ? desiredAction : 'accept',
        appliedAction: ['accept', 'label', 'filter', 'reject'].includes(appliedAction) ? appliedAction : 'accept',
        matchedLabels: [...new Set(
          (Array.isArray(value.matchedLabels) ? value.matchedLabels : [])
            .map(label => this.normalizeSignalLabel(label))
            .filter(Boolean)
        )],
        matchedSources: [...new Set(
          (Array.isArray(value.matchedSources) ? value.matchedSources : [])
            .map(source => typeof source === 'string' ? source.trim().toLowerCase() : '')
            .filter(Boolean)
        )],
        markSensitive: value.markSensitive === true,
      };

      if (typeof value.confidence === 'number' && Number.isFinite(value.confidence)) {
        moderation.confidence = Math.max(0, Math.min(1, value.confidence));
      }
      if (typeof value.reason === 'string' && value.reason.trim()) {
        moderation.reason = value.reason.trim().slice(0, 240);
      }
      if (typeof value.contentWarning === 'string' && value.contentWarning.trim()) {
        moderation.contentWarning = value.contentWarning.trim().slice(0, 160);
      }

      return moderation;
    },

    normalizeSignalLabel(value) {
      if (typeof value !== 'string') {
        return undefined;
      }

      const normalized = value
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .toLowerCase();

      if (!normalized) {
        return undefined;
      }

      return normalized.slice(0, MAX_SIGNAL_LABEL_LENGTH);
    },

    normalizeSignalRaw(value) {
      if (value === undefined) {
        return undefined;
      }

      try {
        const serialized = JSON.stringify(value);
        if (typeof serialized !== 'string') {
          return undefined;
        }

        if (Buffer.byteLength(serialized, 'utf8') <= MAX_SIGNAL_RAW_BYTES) {
          return JSON.parse(serialized);
        }
      } catch {
        return undefined;
      }

      return { truncated: true };
    },

    resolveCandidateSourceUrls(asset) {
      const values = Array.isArray(asset.sourceUrls) ? asset.sourceUrls : [];
      return [...new Set(
        values
          .map(value => this.normalizeHttpUrl(value))
          .filter(Boolean)
      )];
    },

    ensureMediaPipelineContext(resource) {
      const existing = Array.isArray(resource['@context'])
        ? [...resource['@context']]
        : resource['@context']
          ? [resource['@context']]
          : [];

      const hasContext = existing.some(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        return value.apods === APODS;
      });

      if (!hasContext) {
        existing.push(MEDIA_PIPELINE_CONTEXT);
      }

      resource['@context'] = existing;
    },

    mergeMediaAsset(existing, asset, activityPubBinding, mediaPipelineSignals, moderation) {
      const next = { ...existing };
      const preferredUrl = activityPubBinding?.url || asset.canonicalUrl;
      const preferredMimeType = activityPubBinding?.mediaType || asset.mimeType;

      this.ensureMediaPipelineContext(next);

      next.url = preferredUrl;
      next.mediaType = preferredMimeType;

      if (!next.name && typeof asset.alt === 'string' && asset.alt.trim()) {
        next.name = asset.alt.trim();
      }
      if (typeof asset.contentWarning === 'string' && asset.contentWarning.trim()) {
        next.summary = asset.contentWarning.trim();
        next['as:summary'] = asset.contentWarning.trim();
      }
      if (asset.isSensitive === true) {
        next.sensitive = true;
        next['as:sensitive'] = true;
      }
      if (typeof asset.width === 'number' && Number.isFinite(asset.width)) {
        next.width = asset.width;
      }
      if (typeof asset.height === 'number' && Number.isFinite(asset.height)) {
        next.height = asset.height;
      }
      if (typeof asset.size === 'number' && Number.isFinite(asset.size)) {
        next.size = asset.size;
      }
      if (typeof asset.digestMultibase === 'string' && asset.digestMultibase.trim()) {
        next.digestMultibase = asset.digestMultibase.trim();
      }
      if (Array.isArray(asset.focalPoint) && asset.focalPoint.length === 2) {
        next.focalPoint = asset.focalPoint;
      }
      if (typeof asset.blurhash === 'string' && asset.blurhash.trim()) {
        next.blurHash = asset.blurhash.trim();
      }

      const normalizedDuration = this.normalizeDuration(asset.duration);
      if (normalizedDuration) {
        next.duration = normalizedDuration;
      }

      if (Array.isArray(mediaPipelineSignals) && mediaPipelineSignals.length > 0) {
        next.mediaPipelineSignals = mediaPipelineSignals;
        next.mediaPipelineSignalLabels = [...new Set(
          mediaPipelineSignals.flatMap(signal => Array.isArray(signal.labels) ? signal.labels : [])
        )];
        next.mediaPipelineSignalSources = [...new Set(
          mediaPipelineSignals
            .map(signal => (typeof signal.source === 'string' ? signal.source : ''))
            .filter(Boolean)
        )];
        next.mediaPipelineSignalsUpdatedAt = new Date().toISOString();
        next['apods:mediaPipelineSignalsJson'] = JSON.stringify(mediaPipelineSignals);
        next['apods:mediaPipelineSignalLabel'] = next.mediaPipelineSignalLabels;
        next['apods:mediaPipelineSignalSource'] = next.mediaPipelineSignalSources;
        next['apods:mediaPipelineSignalsUpdatedAt'] = next.mediaPipelineSignalsUpdatedAt;
      }

      if (moderation && moderation.appliedAction && moderation.appliedAction !== 'accept') {
        const moderationUpdatedAt = new Date().toISOString();
        next.mediaPipelineModeration = {
          moduleId: moderation.moduleId,
          traceId: moderation.traceId,
          mode: moderation.mode,
          desiredAction: moderation.desiredAction,
          appliedAction: moderation.appliedAction,
          matchedLabels: moderation.matchedLabels,
          matchedSources: moderation.matchedSources,
          confidence: moderation.confidence,
          reason: moderation.reason,
          updatedAt: moderationUpdatedAt,
        };
        next.mediaPipelineModerationAction = moderation.appliedAction;
        next.mediaPipelineModerationLabels = moderation.matchedLabels;
        next['apods:mediaPipelineModerationModuleId'] = moderation.moduleId;
        next['apods:mediaPipelineModerationTraceId'] = moderation.traceId;
        next['apods:mediaPipelineModerationMode'] = moderation.mode;
        next['apods:mediaPipelineModerationDesiredAction'] = moderation.desiredAction;
        next['apods:mediaPipelineModerationAction'] = moderation.appliedAction;
        next['apods:mediaPipelineModerationLabel'] = moderation.matchedLabels;
        next['apods:mediaPipelineModerationSource'] = moderation.matchedSources;
        next['apods:mediaPipelineModerationUpdatedAt'] = moderationUpdatedAt;
        if (typeof moderation.confidence === 'number' && Number.isFinite(moderation.confidence)) {
          next['apods:mediaPipelineModerationConfidence'] = moderation.confidence;
        }
        if (typeof moderation.reason === 'string' && moderation.reason) {
          next['apods:mediaPipelineModerationReason'] = moderation.reason;
        }
        if (moderation.markSensitive === true) {
          next.sensitive = true;
          next['as:sensitive'] = true;
        }
        if (!next.summary && typeof moderation.contentWarning === 'string' && moderation.contentWarning) {
          next.summary = moderation.contentWarning;
          next['as:summary'] = moderation.contentWarning;
        }
        if (typeof moderation.contentWarning === 'string' && moderation.contentWarning) {
          next['apods:mediaPipelineModerationContentWarning'] = moderation.contentWarning;
        }
      }

      return next;
    },

    async persistMediaPipelineMetadata(ctx, resourceUri, asset, mediaPipelineSignals, moderation) {
      const metadata = this.buildMediaPipelineMetadata(resourceUri, asset, mediaPipelineSignals, moderation);
      const quads = await ctx.call('jsonld.parser.toQuads', { input: metadata });
      const insertQuads = quads.filter(
        quad => quad.subject.termType === 'NamedNode' && quad.subject.value === resourceUri && MEDIA_PIPELINE_PREDICATES.includes(quad.predicate.value)
      );
      const deleteTriples = MEDIA_PIPELINE_PREDICATES.map((predicate, index) => `OPTIONAL { <${resourceUri}> <${predicate}> ?existing${index} . }`).join('\n');
      const deleteTemplate = MEDIA_PIPELINE_PREDICATES.map((predicate, index) => `<${resourceUri}> <${predicate}> ?existing${index} .`).join('\n');
      let query = `DELETE {\n${deleteTemplate}\n}`;
      if (insertQuads.length > 0) {
        query += `\nINSERT {\n${insertQuads.map(quad => this.quadToSparql(quad)).join('\n')}\n}`;
      }
      query += `\nWHERE {\n${deleteTriples}\n}`;

      await ctx.call('triplestore.update', {
        query,
        dataset: getDatasetFromUri(resourceUri),
        webId: 'system',
      });
    },

    buildMediaPipelineMetadata(resourceUri, asset, mediaPipelineSignals, moderation) {
      const metadata = {
        '@context': ['https://www.w3.org/ns/activitystreams', MEDIA_PIPELINE_CONTEXT],
        id: resourceUri,
      };

      if (typeof asset.contentWarning === 'string' && asset.contentWarning.trim()) {
        metadata['as:summary'] = asset.contentWarning.trim();
      }
      if (asset.isSensitive === true) {
        metadata['as:sensitive'] = true;
      }
      if (Array.isArray(mediaPipelineSignals) && mediaPipelineSignals.length > 0) {
        const signalLabels = [...new Set(
          mediaPipelineSignals.flatMap(signal => Array.isArray(signal.labels) ? signal.labels : [])
        )];
        const signalSources = [...new Set(
          mediaPipelineSignals
            .map(signal => (typeof signal.source === 'string' ? signal.source : ''))
            .filter(Boolean)
        )];
        metadata['apods:mediaPipelineSignalsJson'] = JSON.stringify(mediaPipelineSignals);
        metadata['apods:mediaPipelineSignalLabel'] = signalLabels;
        metadata['apods:mediaPipelineSignalSource'] = signalSources;
        metadata['apods:mediaPipelineSignalsUpdatedAt'] = new Date().toISOString();
      }
      if (moderation && moderation.appliedAction && moderation.appliedAction !== 'accept') {
        const moderationUpdatedAt = new Date().toISOString();
        metadata['apods:mediaPipelineModerationModuleId'] = moderation.moduleId;
        metadata['apods:mediaPipelineModerationTraceId'] = moderation.traceId;
        metadata['apods:mediaPipelineModerationMode'] = moderation.mode;
        metadata['apods:mediaPipelineModerationDesiredAction'] = moderation.desiredAction;
        metadata['apods:mediaPipelineModerationAction'] = moderation.appliedAction;
        metadata['apods:mediaPipelineModerationLabel'] = moderation.matchedLabels;
        metadata['apods:mediaPipelineModerationSource'] = moderation.matchedSources;
        metadata['apods:mediaPipelineModerationUpdatedAt'] = moderationUpdatedAt;
        if (typeof moderation.confidence === 'number' && Number.isFinite(moderation.confidence)) {
          metadata['apods:mediaPipelineModerationConfidence'] = moderation.confidence;
        }
        if (typeof moderation.reason === 'string' && moderation.reason) {
          metadata['apods:mediaPipelineModerationReason'] = moderation.reason;
        }
        if (moderation.markSensitive === true) {
          metadata['as:sensitive'] = true;
        }
        if (typeof moderation.contentWarning === 'string' && moderation.contentWarning) {
          metadata['apods:mediaPipelineModerationContentWarning'] = moderation.contentWarning;
          if (!metadata['as:summary']) {
            metadata['as:summary'] = moderation.contentWarning;
          }
        }
      }

      return metadata;
    },

    quadToSparql(quad) {
      return `<${quad.subject.value}> <${quad.predicate.value}> ${this.rdfTermToSparql(quad.object)} .`;
    },

    rdfTermToSparql(term) {
      if (term.termType === 'NamedNode') {
        return `<${term.value}>`;
      }
      if (term.termType === 'Literal') {
        if (term.datatype?.value === 'http://www.w3.org/2001/XMLSchema#string') {
          return `'''${term.value?.replace(/'/g, "\\'")}'''`;
        }
        if (term.datatype?.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') {
          return `'''${term.value}'''@${term.language}`;
        }
        return `"${term.value}"^^<${term.datatype.value}>`;
      }
      throw new Error(`Unsupported RDF term type: ${term.termType}`);
    },

    normalizeDuration(value) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return undefined;
      }

      const normalizedSeconds = Number(value.toFixed(3));
      return `PT${normalizedSeconds}S`;
    },
  },
};
