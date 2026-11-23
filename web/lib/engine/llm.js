// OPTIONAL: rewrite the chatbot's answer with a language model (retrieval-augmented generation).
// Disabled unless the server has ANTHROPIC_API_KEY set. The documents used and the sources shown
// stay exactly the same; only the wording of the answer changes. Any error falls back to the
// extractive answer, so the chatbot never depends on the external service.
import { DOC_BY_ID } from './search.js';

const MODEL = process.env.LLM_MODEL || 'claude-haiku-5-5';
const TIMEOUT_MS = 7000;

export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function enhanceWithLLM(question, result) {
  if (!llmEnabled() || result.intent !== 'answer') return result;
  const lang = result.lang;
  const context = (result.context?.snippetDocs || []).map((id) => {
    const d = DOC_BY_ID.get(id);
    return `[${d.id}] ${d[`title_${lang}`]}\n${d[`text_${lang}`]}`;
  }).join('\n\n');
  const system = lang === 'es'
    ? 'Eres el asistente del sistema de gestión del conocimiento de una planta Toyota (prototipo académico). Responde SOLO con la información de los documentos dados, en español, en 2 a 4 oraciones, y cita el ID del documento entre corchetes. Si los documentos no contienen la respuesta, dilo.'
    : 'You are the assistant of a Toyota plant knowledge management system (academic prototype). Answer ONLY from the given documents, in English, in 2 to 4 sentences, citing the document ID in brackets. If the documents do not contain the answer, say so.';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 350, system,
        messages: [{ role: 'user', content: `Documentos / documents:\n\n${context}\n\nPregunta / question: ${question}` }],
      }),
    });
    if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text) throw new Error('empty LLM answer');
    return { ...result, answer: text, extractiveAnswer: result.answer, mode: 'llm' };
  } catch (err) {
    return { ...result, llmError: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
