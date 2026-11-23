// Recommendation system.
//  1. related(docId): content-based, precomputed in Python (cosine + shared ontology concepts).
//  2. forHistory(history): context-based, computed per request from the user's recent searches and
//     opened documents. Recent activity weighs more (exponential decay), opened documents are excluded.
import kb from '../data/kb.js';
import { combine, dot, vectorize } from './text.js';
import { DOC_BY_ID, DOCS, docVector } from './search.js';

const DECAY = 0.7;           // weight of an item that is one step older
const MAX_ITEMS = 8;

export function related(docId, limit = 5) {
  return (kb.recommendations[docId] || []).slice(0, limit).map((r) => ({
    ...r, doc: DOC_BY_ID.get(r.id),
  }));
}

/**
 * @param {{ queries?: string[], viewed?: string[] }} history  most recent LAST
 */
export function forHistory({ queries = [], viewed = [] } = {}, limit = 5) {
  const items = [];
  queries.slice(-MAX_ITEMS).forEach((q, i, arr) => items.push({ kind: 'query', value: q, age: arr.length - 1 - i, vec: vectorize(q, kb.index) }));
  viewed.slice(-MAX_ITEMS).forEach((id, i, arr) => items.push({ kind: 'doc', value: id, age: arr.length - 1 - i, vec: docVector(id) }));
  const active = items.filter((it) => it.vec.size > 0);
  if (!active.length) return { items: [], profileSize: 0 };

  const profile = combine(active.map((it) => [it.vec, Math.pow(DECAY, it.age) * (it.kind === 'doc' ? 0.8 : 1)]));
  const exclude = new Set(viewed);
  const viewedConcepts = new Set(viewed.flatMap((id) => DOC_BY_ID.get(id)?.concepts || []));

  const scored = DOCS.filter((d) => !exclude.has(d.id)).map((d) => {
    const vec = docVector(d.id);
    const base = dot(profile, vec);
    const shared = d.concepts.filter((c) => viewedConcepts.has(c));
    const score = base + 0.04 * shared.length;
    // which history item explains this recommendation best
    let because = null, bestSim = 0;
    for (const it of active) {
      const s = dot(it.vec, vec) * Math.pow(DECAY, it.age);
      if (s > bestSim) { bestSim = s; because = { kind: it.kind, value: it.value }; }
    }
    return { id: d.id, doc: d, score, sharedConcepts: shared, because };
  }).sort((a, b) => b.score - a.score);

  return { items: scored.slice(0, limit), profileSize: active.length };
}
