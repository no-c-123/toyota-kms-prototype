// Local stand-in for Vercel's serverless runtime: serves every file in /api on http://localhost:3001.
// `npm run dev` starts it together with Vite (which proxies /api here).
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.API_PORT || 3001);
const routes = {};
for (const name of ['chat', 'search', 'recommend', 'classify', 'health']) {
  routes[`/api/${name}`] = (await import(`./api/${name}.js`)).default;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = routes[url.pathname];
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  if (!handler) return res.status(404).json({ error: 'not found' });
  req.query = Object.fromEntries(url.searchParams);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
  try { await handler(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'internal error' }); }
}).listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
