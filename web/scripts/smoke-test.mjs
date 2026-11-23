// Quick checks that every API function works (no server needed). Run: npm test
import assert from 'node:assert/strict';
import chatApi from '../api/chat.js';
import searchApi from '../api/search.js';
import recommendApi from '../api/recommend.js';
import classifyApi from '../api/classify.js';
import healthApi from '../api/health.js';

function call(handler, { method = 'GET', query = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      headers: {}, statusCode: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); return this; },
      end() { resolve({ status: this.statusCode, body: null }); },
    };
    handler({ method, query, body }, res);
  });
}

const checks = [
  ['health', async () => { const r = await call(healthApi); assert.equal(r.body.documents, 72); }],
  ['chat answers from the right document', async () => {
    const r = await call(chatApi, { method: 'POST', body: { message: '¿Qué hago si se derrama solvente?' } });
    assert.equal(r.body.intent, 'answer'); assert.equal(r.body.primaryDocId, 'SAF-005');
  }],
  ['chat defines a concept', async () => {
    const r = await call(chatApi, { method: 'POST', body: { message: 'What is kanban?' } });
    assert.equal(r.body.intent, 'definition'); assert.equal(r.body.conceptId, 'kanban');
  }],
  ['chat declines out-of-scope questions', async () => {
    const r = await call(chatApi, { method: 'POST', body: { message: '¿Cuánto cuesta un RAV4 2026?' } });
    assert.equal(r.body.intent, 'fallback');
  }],
  ['chat uses conversation context', async () => {
    const history = [{ role: 'user', content: 'Háblame del plan de evacuación' }, { role: 'assistant', content: '...', primaryDocId: 'SAF-006' }];
    const r = await call(chatApi, { method: 'POST', body: { message: '¿cada cuánto se practica?', history } });
    assert.equal(r.body.primaryDocId, 'SAF-006');
  }],
  ['chat rejects empty messages', async () => { const r = await call(chatApi, { method: 'POST', body: {} }); assert.equal(r.status, 400); }],
  ['search ranks documents', async () => { const r = await call(searchApi, { query: { q: 'wind tunnel drag' } }); assert.equal(r.body.results[0].id, 'RD-006'); }],
  ['recommend related + history', async () => {
    const r = await call(recommendApi, { method: 'POST', body: { docId: 'SC-001', queries: ['kanban'], viewed: ['SC-001'] } });
    assert.equal(r.body.related.length, 5); assert.ok(r.body.forYou.every((x) => x.id !== 'SC-001'));
  }],
  ['classify', async () => {
    const r = await call(classifyApi, { method: 'POST', body: { text: 'Engineers tested the prototype in the wind tunnel and on the dynamometer' } });
    assert.equal(r.body.prediction.category, 'R&D');
  }],
];

let failed = 0;
for (const [name, fn] of checks) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
process.exit(failed ? 1 : 0);
