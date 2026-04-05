import urlJoin from 'url-join';

declare const CONFIG: { BACKEND_URL: string };

const BASE = urlJoin(CONFIG.BACKEND_URL, '/api/dashboard');

function headers() {
  const token = localStorage.getItem('token');
  const h = new Headers({ 'Content-Type': 'application/json' });
  if (token) h.set('Authorization', `Bearer ${token}`);
  return h;
}

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(urlJoin(BASE, path), {
    ...options,
    headers: headers()
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }

  return json;
}

export const dashboardApi = {
  list: (container: string) => req(`settings/${encodeURIComponent(container)}`),

  create: (container: string, data: unknown) =>
    req(`settings/${encodeURIComponent(container)}`, {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  update: (resourceUri: string, data: unknown) =>
    req('settings', {
      method: 'PUT',
      body: JSON.stringify({ resourceUri, data })
    }),

  patch: (resourceUri: string, data: unknown) =>
    req('settings', {
      method: 'PATCH',
      body: JSON.stringify({ resourceUri, data })
    }),

  remove: (resourceUri: string) =>
    req('settings/delete', {
      method: 'POST',
      body: JSON.stringify({ resourceUri })
    }),

  listAppConsents: () => req('settings/app-consents'),

  createAppConsent: (data: unknown) =>
    req('settings/app-consents', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  previewSource: (url: string) => req(`settings/preview?url=${encodeURIComponent(url)}`)
};
