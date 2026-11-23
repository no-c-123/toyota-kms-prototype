// POST /api/recommend  { docId?: string, queries?: string[], viewed?: string[] }
//   docId          -> documents related to that document (content-based)
//   queries/viewed -> personalized suggestions from the session history (context-based)
import { forHistory, related } from '../lib/engine/recommend.js';
import { allow, body, text } from '../lib/http.js';

const brief = (r) => ({
  id: r.id, score: Number(r.score.toFixed(4)), title_es: r.doc.title_es, title_en: r.doc.title_en,
  category: r.doc.category, sharedConcepts: r.shared_concepts || r.sharedConcepts || [], because: r.because || null,
});

export default function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  const b = body(req);
  const docId = text(b.docId, 20);
  const out = {};
  if (docId) out.related = related(docId, 5).map(brief);
  const queries = Array.isArray(b.queries) ? b.queries.map((q) => text(q, 300)).filter(Boolean) : [];
  const viewed = Array.isArray(b.viewed) ? b.viewed.map((v) => text(v, 20)).filter(Boolean) : [];
  if (queries.length || viewed.length) out.forYou = forHistory({ queries, viewed }, 5).items.map(brief);
  res.status(200).json(out);
}
