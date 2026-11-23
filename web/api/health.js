// GET /api/health  -> service status and knowledge base size
import kb from '../lib/data/kb.js';
import { llmEnabled } from '../lib/engine/llm.js';

export default function handler(req, res) {
  res.status(200).json({
    status: 'ok', documents: kb.meta.n_documents, concepts: kb.concepts.length,
    built_at: kb.meta.built_at, answer_mode: llmEnabled() ? 'retrieval + LLM' : 'retrieval (extractive)',
  });
}
