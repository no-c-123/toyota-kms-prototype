// GET /api/search?q=...&limit=8
import { search, snippet } from '../lib/engine/search.js';
import { detectLanguage } from '../lib/engine/text.js';
import { allow, text } from '../lib/http.js';

export default function handler(req, res) {
  if (!allow(req, res, ['GET'])) return;
  const q = text(req.query?.q, 300).trim();
  if (!q) return res.status(400).json({ error: 'q is required' });
  const limit = Math.min(Number(req.query?.limit) || 8, 20);
  const lang = detectLanguage(q);
  const r = search(q, { limit });
  res.status(200).json({
    query: q, lang, concepts: r.concepts, confident: r.confident,
    results: r.results.filter((x) => x.score > 0.02).map((x) => ({
      id: x.id, score: Number(x.score.toFixed(4)), cosine: Number(x.cosine.toFixed(4)),
      conceptBoost: Number(x.conceptBoost.toFixed(4)), matchedConcepts: x.matchedConcepts,
      title: x.doc[`title_${lang}`], category: x.doc.category, snippet: snippet(x.doc, lang, r.queryVector, 1),
    })),
  });
}
