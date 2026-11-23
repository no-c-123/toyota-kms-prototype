// Client for the serverless API (same paths locally and on Vercel).
async function call(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  chat: (message, history) => call('/api/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  search: (q, limit = 10) => call(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  related: (docId) => call('/api/recommend', { method: 'POST', body: JSON.stringify({ docId }) }),
  forYou: (queries, viewed) => call('/api/recommend', { method: 'POST', body: JSON.stringify({ queries, viewed }) }),
  classify: (text) => call('/api/classify', { method: 'POST', body: JSON.stringify({ text }) }),
  health: () => call('/api/health'),
};
