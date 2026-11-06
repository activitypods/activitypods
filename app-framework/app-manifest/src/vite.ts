import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, type Plugin, type ResolvedConfig, type ViteDevServer } from 'vite';
import { CLIENT_DOCUMENT, generateDocuments, serialize } from './generate.ts';
import { MANIFEST_FILE, readManifest } from './manifest.ts';

const VIRTUAL_ID = 'virtual:app-manifest';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

const withTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

export const appManifest = (options: { origin?: string } = {}): Plugin => {
  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;

  const manifestPath = () => resolve(config.root, MANIFEST_FILE);

  const getBaseUrl = () => {
    const origin = options.origin ?? loadEnv(config.mode, config.envDir, '').PUBLIC_URL;
    if (origin) return withTrailingSlash(new URL(config.base, withTrailingSlash(origin)).href);
    // Includes the base, and the actual port if the configured one was busy
    const devUrl = server?.resolvedUrls?.local[0];
    if (devUrl) return devUrl;
    throw new Error('app-manifest: set PUBLIC_URL to the URL of the app, as it is part of its client ID');
  };

  return {
    name: 'activitypods-app-manifest',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return undefined;
      return `export const clientId = ${JSON.stringify(new URL(CLIENT_DOCUMENT, getBaseUrl()).href)};`;
    },

    configureServer(devServer) {
      server = devServer;
      devServer.watcher.add(manifestPath());

      devServer.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0].slice(config.base.length);
        if (path !== CLIENT_DOCUMENT && !path?.startsWith('access-needs/')) return next();

        try {
          const manifest = await readManifest(manifestPath());
          const document = generateDocuments(manifest, getBaseUrl())[path];
          if (!document) {
            res.statusCode = 404;
            return res.end();
          }

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          // The Pod provider's frontend fetches the access needs from another origin
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(serialize(document));
        } catch (e) {
          next(e);
        }
      });
    },

    async generateBundle() {
      if (existsSync(resolve(config.publicDir, CLIENT_DOCUMENT))) {
        this.warn(`${CLIENT_DOCUMENT} in the public directory is replaced by the one generated from ${MANIFEST_FILE}`);
      }
      this.addWatchFile(manifestPath());

      const documents = generateDocuments(await readManifest(manifestPath()), getBaseUrl());
      for (const [fileName, document] of Object.entries(documents)) {
        this.emitFile({ type: 'asset', fileName, source: serialize(document) });
      }
    }
  };
};
