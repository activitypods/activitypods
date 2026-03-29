const dns = require('dns').promises;
const net = require('net');
const fetch = require('node-fetch');
const { assertHttpsUrl } = require('./oauth-security');

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
}

async function assertSafeTarget(url, allowLocalhostHttp) {
  const parsed = assertHttpsUrl(url, { allowLocalhostHttp, field: 'target url' });
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length) {
    throw new Error('target host has no resolvable address');
  }

  for (const item of addresses) {
    if (isPrivateIp(item.address)) {
      const isLocal = item.address === '127.0.0.1' || item.address === '::1';
      if (!(allowLocalhostHttp && isLocal)) {
        throw new Error('target resolves to private network address');
      }
    }
  }
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function isRetryableError(error) {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed')
  );
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options) {
  const {
    timeoutMs = 5000,
    maxAttempts = 5,
    baseDelayMs = 250,
    maxDelayMs = 5000,
    allowLocalhostHttp = false,
    headers = {}
  } = options || {};

  await assertSafeTarget(url, allowLocalhostHttp);

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...headers
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          const cap = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
          await sleep(Math.floor(Math.random() * cap));
          continue;
        }
        throw new Error(`upstream responded ${response.status}`);
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        throw new Error('upstream content type must be application/json');
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        break;
      }
      const cap = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      await sleep(Math.floor(Math.random() * cap));
    }
  }

  throw lastError || new Error('fetch failed');
}

module.exports = {
  fetchJsonWithRetry,
  assertSafeTarget
};
