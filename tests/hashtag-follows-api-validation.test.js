const fetch = require('node-fetch');
const urlJoin = require('url-join');

jest.setTimeout(50000);

const BASE_URL = 'http://localhost:3000';
const PASSWORD = 'password123';

const fetchServer = async (path, options = {}) => {
  const headers = new fetch.Headers(options.headers || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path.startsWith('http') ? path : urlJoin(BASE_URL, path), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const bodyText = await response.text();
  let json;

  try {
    json = JSON.parse(bodyText);
  } catch {
    json = undefined;
  }

  return {
    status: response.status,
    headers: response.headers,
    bodyText,
    json
  };
};

describe('hashtag follows API validation contract', () => {
  beforeAll(async () => {
    // Use /.well-known/nodeinfo as a liveness probe — it returns 200 as soon as
    // the backend is up, without requiring any Fuseki user datasets to exist.
    let livenessStatus;
    try {
      const res = await fetch(urlJoin(BASE_URL, '/.well-known/nodeinfo'));
      livenessStatus = res.status;
    } catch (err) {
      throw new Error(
        `pod-provider backend is unreachable at ${BASE_URL} (${err.message}) — start docker compose and the backend before running API tests`
      );
    }
    if (livenessStatus !== 200) {
      throw new Error(
        `pod-provider backend is not ready at ${BASE_URL}/.well-known/nodeinfo (got HTTP ${livenessStatus}) — check backend and Fuseki logs`
      );
    }
  });

  test('returns the exact validation error contract for oversized hashtag input', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const username = `hashtagapi${suffix}`;

    const signupResponse = await fetchServer('/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        username,
        password: PASSWORD,
        email: `${username}@example.com`
      }
    });

    expect(signupResponse.status).toBe(200);
    expect(signupResponse.json?.token).toEqual(expect.any(String));

    const token = signupResponse.json.token;
    const invalidTag = `#${'a'.repeat(300)}`;

    const followResponse = await fetchServer('/api/dashboard/hashtags/follows', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        tag: invalidTag
      }
    });

    expect(followResponse.status).toBe(400);
    expect(followResponse.json).toBeDefined();
    expect(followResponse.json.message).toBe('Invalid hashtag format');
    expect(followResponse.json.type).toBe('VALIDATION_ERROR');
    expect(followResponse.json.code).toBe(400);
  });
});
