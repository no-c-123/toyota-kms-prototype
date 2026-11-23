// POST /api/classify  { text: string }
import { classify } from '../lib/engine/classify.js';
import { allow, body, text } from '../lib/http.js';

export default function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  const t = text(body(req).text, 5000).trim();
  if (t.length < 3) return res.status(400).json({ error: 'text is required' });
  res.status(200).json(classify(t));
}
