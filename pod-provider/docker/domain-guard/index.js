import express from 'express';
import { readFileSync } from 'fs';
import { URL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKLIST = new Set(JSON.parse(readFileSync(join(__dirname, 'blocklist.json'), 'utf8')));

const app = express();

/**
 * Extract the origin server's domain from an incoming ActivityPub request.
 * Checks in priority order:
 *   1. HTTP Signature keyId (most reliable — uniquely identifies the AP actor's server)
 *   2. Origin header
 *   3. Referer header
 */
function extractDomain(req) {
  const sig = req.headers['signature'] || '';
  const keyIdMatch = sig.match(/keyId="([^"]+)"/);
  if (keyIdMatch) {
    try {
      return new URL(keyIdMatch[1]).hostname;
    } catch {}
  }

  const origin = req.headers['origin'];
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {}
  }

  const referer = req.headers['referer'];
  if (referer) {
    try {
      return new URL(referer).hostname;
    } catch {}
  }

  return null;
}

app.use((req, res) => {
  const domain = extractDomain(req);

  if (domain && BLOCKLIST.has(domain)) {
    console.log(
      `[blocked] ${domain} — ${req.headers['x-forwarded-method'] || req.method} ${req.headers['x-forwarded-uri'] || req.url}`
    );
    return res.status(403).json({ error: 'Forbidden', domain });
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`domain-guard listening on :${PORT}`));
