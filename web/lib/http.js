// Small helpers shared by the serverless functions in /api.
export function allow(req, res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (!methods.includes(req.method)) { res.status(405).json({ error: `Use ${methods.join(' or ')}` }); return false; }
  return true;
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
