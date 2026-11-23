// System evaluation: chatbot accuracy, retrieval precision/recall, recommendation quality.
// Runs the SAME engine the deployed API uses, then merges the Python reports into
// src/data/metrics.json (shown on the Metrics page).
//
//   node scripts/evaluate.mjs            -> evaluate dev + test, write metrics.json
//   node scripts/evaluate.mjs --dev      -> dev set only, print every failure (used for tuning)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from '../lib/engine/chatbot.js';
import { search, DOCS, DOC_BY_ID } from '../lib/engine/search.js';
import { forHistory } from '../lib/engine/recommend.js';
import kb from '../lib/data/kb.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const devOnly = process.argv.includes('--dev');

function judge(res, expected) {
  const e = expected[0];
  if (e === 'fallback') return res.intent === 'fallback';
  if (e.startsWith('concept:')) return res.intent === 'definition' && res.conceptId === e.slice(8);
  if (e.startsWith('category:')) return res.intent === 'list' && res.category === e.slice(9);
  return res.intent === 'answer' && expected.includes(res.primaryDocId);
}

const kindOf = (e) => (e === 'fallback' ? 'out_of_scope' : e.startsWith('concept:') ? 'definition' : e.startsWith('category:') ? 'category_list' : 'document_question');

function evaluateSet(name, file) {
  const set = read(file);
  const rows = [];
  const t0 = performance.now();
  for (const item of set.single) {
    const res = chat(item.q, []);
    const r = { q: item.q, lang: res.lang, kind: kindOf(item.expected[0]), expected: item.expected,
      intent: res.intent, got: res.primaryDocId || res.conceptId || res.category || null,
      confidence: res.confidence ?? null, correct: judge(res, item.expected), answer: res.answer };
    if (r.kind === 'document_question') {
      const ranked = search(item.q, { limit: 10 }).results.map((x) => x.id);
      const rank = Math.min(...item.expected.map((id) => { const i = ranked.indexOf(id); return i < 0 ? 99 : i; }));
      r.rank = rank;
    }
    rows.push(r);
  }
  const convRows = [];
  for (const conv of set.conversations || []) {
    const history = [];
    let last;
    for (const turn of conv.turns) {
      last = chat(turn, history);
      history.push({ role: 'user', content: turn });
      history.push({ role: 'assistant', content: last.answer, primaryDocId: last.primaryDocId });
    }
    convRows.push({ turns: conv.turns, expected: conv.expected, got: last.primaryDocId, intent: last.intent,
      usedContext: last.usedContext, correct: judge(last, conv.expected) });
  }
  const ms = (performance.now() - t0) / (rows.length + convRows.length * 2);

  const pct = (xs) => (xs.length ? xs.filter((x) => x.correct).length / xs.length : null);
  const docQs = rows.filter((r) => r.kind === 'document_question');
  const shouldDecline = rows.filter((r) => r.kind === 'out_of_scope');
  const declined = rows.filter((r) => r.intent === 'fallback');
  const all = [...rows, ...convRows];
  const summary = {
    n_questions: all.length,
    accuracy: pct(all),
    correct: all.filter((x) => x.correct).length,
    by_kind: Object.fromEntries(['document_question', 'definition', 'category_list', 'out_of_scope']
      .map((k) => [k, { n: rows.filter((r) => r.kind === k).length, accuracy: pct(rows.filter((r) => r.kind === k)) }])),
    conversations: { n: convRows.length, accuracy: pct(convRows) },
    by_language: Object.fromEntries(['es', 'en'].map((l) => [l, { n: rows.filter((r) => r.lang === l).length, accuracy: pct(rows.filter((r) => r.lang === l)) }])),
    retrieval: {
      n: docQs.length,
      precision_at_1: docQs.filter((r) => r.rank === 0).length / docQs.length,
      recall_at_3: docQs.filter((r) => r.rank < 3).length / docQs.length,
      recall_at_5: docQs.filter((r) => r.rank < 5).length / docQs.length,
      mrr: docQs.reduce((s, r) => s + (r.rank < 99 ? 1 / (r.rank + 1) : 0), 0) / docQs.length,
    },
    out_of_scope_detection: {
      precision: declined.length ? declined.filter((r) => r.kind === 'out_of_scope').length / declined.length : null,
      recall: shouldDecline.length ? shouldDecline.filter((r) => r.intent === 'fallback').length / shouldDecline.length : null,
    },
    avg_response_ms: Number(ms.toFixed(2)),
  };
  return { name, summary, rows, convRows };
}

// --- history / context recommender ---------------------------------------------------------
function evaluateHistoryRecommender() {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const byCat = {};
  for (const d of DOCS) (byCat[d.category] ||= []).push(d.id);
  const cats = Object.keys(byCat);
  const pick = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);

  // single-topic sessions: 3 opened documents + 1 search from the same category
  let coherent = 0, total = 0, conceptShare = 0;
  for (let s = 0; s < 120; s++) {
    const cat = cats[s % cats.length];
    const viewed = pick(byCat[cat], 3);
    const query = DOC_BY_ID.get(pick(byCat[cat].filter((id) => !viewed.includes(id)), 1)[0]).title_es;
    const recs = forHistory({ queries: [query], viewed }).items;
    const viewedConcepts = new Set(viewed.flatMap((id) => DOC_BY_ID.get(id).concepts));
    for (const r of recs) {
      total++;
      if (r.doc.category === cat) coherent++;
      if (r.doc.category === cat || r.doc.concepts.some((c) => viewedConcepts.has(c))) conceptShare++;
    }
  }
  // topic drift: two older documents from category A, then two recent ones from category B
  let recentShare = 0, n = 0;
  for (let s = 0; s < 120; s++) {
    const a = cats[s % cats.length], b = cats[(s + 1 + (s % 5)) % cats.length];
    const viewed = [...pick(byCat[a], 2), ...pick(byCat[b], 2)];
    const recs = forHistory({ viewed }).items;
    recentShare += recs.filter((r) => r.doc.category === b).length;
    n += recs.length;
  }
  return {
    protocol: '120 simulated single-topic sessions (3 opened documents + 1 search) and 120 topic-change sessions (2 older documents from one category, then 2 recent ones from another).',
    precision_at_5_same_category: coherent / total,
    precision_at_5_category_or_concept: conceptShare / total,
    random_baseline_same_category: 11 / 71,
    recent_topic_share_after_change: recentShare / n,
  };
}

// --- run -------------------------------------------------------------------------------------
const dev = evaluateSet('dev', 'data/eval/chatbot_dev.json');
const print = (r) => {
  const s = r.summary;
  console.log(`\n[${r.name}] chatbot accuracy ${(s.accuracy * 100).toFixed(1)}% (${s.correct}/${s.n_questions})  ` +
    `P@1 ${(s.retrieval.precision_at_1 * 100).toFixed(1)}%  R@3 ${(s.retrieval.recall_at_3 * 100).toFixed(1)}%  MRR ${s.retrieval.mrr.toFixed(3)}  ` +
    `${s.avg_response_ms} ms/question`);
  console.log('  by kind:', JSON.stringify(s.by_kind));
  console.log('  conversations:', JSON.stringify(s.conversations), ' by language:', JSON.stringify(s.by_language));
  console.log('  out-of-scope detection:', JSON.stringify(s.out_of_scope_detection));
};
print(dev);
if (devOnly) {
  for (const r of [...dev.rows, ...dev.convRows].filter((x) => !x.correct)) {
    console.log(`  FAIL ${JSON.stringify(r.q || r.turns)} expected ${r.expected} got ${r.intent}:${r.got} conf ${r.confidence ?? ''} rank ${r.rank ?? ''}`);
  }
  process.exit(0);
}
const test = evaluateSet('test', 'data/eval/chatbot_test.json');
print(test);
for (const r of [...test.rows, ...test.convRows].filter((x) => !x.correct)) {
  console.log(`  test miss ${JSON.stringify(r.q || r.turns)} expected ${r.expected} got ${r.intent}:${r.got}`);
}
const history = evaluateHistoryRecommender();
console.log('\nHistory recommender:', JSON.stringify(history));

const py = (f) => { try { return read(`ml/output/${f}`); } catch { return null; } };
let usability = null;
try { usability = read('web/src/data/usability.json'); } catch { /* filled by scripts/lighthouse.mjs */ }
const metrics = {
  generated_at: new Date().toISOString(),
  corpus: { documents: kb.meta.n_documents, languages: ['es', 'en'], concepts: kb.concepts.length },
  classification: py('classification_report.json'),
  recommender_content: py('recommender_report.json'),
  recommender_history: history,
  chatbot: { dev: dev.summary, test: test.summary },
  graph: py('graph_report.json'),
  usability,
};
fs.writeFileSync(path.join(root, 'web/src/data/metrics.json'), JSON.stringify(metrics, null, 2));
fs.writeFileSync(path.join(root, 'ml/output/chatbot_eval_details.json'), JSON.stringify({ dev: dev.rows.concat(dev.convRows), test: test.rows.concat(test.convRows) }, null, 2));
console.log('\nWrote web/src/data/metrics.json and ml/output/chatbot_eval_details.json');
