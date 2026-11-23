// POST /api/chat  { message: string, history?: [{role, content, primaryDocId?}] }
import { chat } from '../lib/engine/chatbot.js';
import { enhanceWithLLM } from '../lib/engine/llm.js';
import { allow, body, text } from '../lib/http.js';

export default async function handler(req, res) {
  if (!allow(req, res, ['POST'])) return;
  const { message, history } = body(req);
  const msg = text(message, 500).trim();
  if (!msg) return res.status(400).json({ error: 'message is required' });
  const safeHistory = Array.isArray(history)
    ? history.slice(-12).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: text(h.content, 1000), primaryDocId: text(h.primaryDocId, 20) || undefined }))
    : [];
  const started = Date.now();
  const result = await enhanceWithLLM(msg, chat(msg, safeHistory));
  delete result.context;
  res.status(200).json({ ...result, ms: Date.now() - started });
}
