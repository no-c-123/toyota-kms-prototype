// Text processing - JavaScript twin of ml/text_processing.py.
// Any change here must be mirrored in Python (ml/check_parity.py verifies both agree).
import kb from '../data/kb.js';

const STOP = new Set(kb.meta.stop_words);
const STEM_LEN = kb.meta.stem_len;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stem(token) {
  return /^\d+$/.test(token) ? token : token.slice(0, STEM_LEN);
}

export function tokens(text) {
  const n = normalize(text);
  if (!n) return [];
  return n.split(' ').filter((t) => t.length > 1 && !STOP.has(t)).map(stem);
}

export function analyzer(text) {
  const toks = tokens(text);
  const grams = [...toks];
  for (let i = 0; i + 1 < toks.length; i++) grams.push(`${toks[i]}_${toks[i + 1]}`);
  return grams;
}

export function containsPhrase(normalizedText, normalizedPhrase) {
  return Boolean(normalizedPhrase) && ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

// sklearn TfidfVectorizer(sublinear_tf=True, norm='l2', smooth_idf=True).transform, as a sparse Map
export function vectorize(text, vectorizer) {
  const counts = new Map();
  for (const g of analyzer(text)) {
    const idx = vectorizer.vocab[g];
    if (idx !== undefined) counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  const vec = new Map();
  let norm = 0;
  for (const [idx, c] of counts) {
    const w = (1 + Math.log(c)) * vectorizer.idf[idx];
    vec.set(idx, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [idx, w] of vec) vec.set(idx, w / norm);
  return vec;
}

export function fromPairs(pairs) {
  return new Map(pairs);
}

export function dot(a, b) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [idx, w] of small) {
    const v = large.get(idx);
    if (v !== undefined) s += w * v;
  }
  return s;
}

// weighted sum of sparse vectors, re-normalized to unit length
export function combine(weighted) {
  const out = new Map();
  for (const [vec, weight] of weighted) {
    for (const [idx, w] of vec) out.set(idx, (out.get(idx) || 0) + w * weight);
  }
  let norm = 0;
  for (const w of out.values()) norm += w * w;
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [idx, w] of out) out.set(idx, w / norm);
  return out;
}

const ES_HINTS = new Set(['que', 'como', 'cual', 'cuales', 'donde', 'cuando', 'por', 'para', 'el', 'la', 'los', 'las',
  'de', 'del', 'en', 'un', 'una', 'es', 'son', 'hay', 'se', 'y', 'con', 'mi', 'puedo', 'hago', 'quien', 'cuanto',
  'cuantos', 'tiene', 'hola', 'gracias', 'documentos', 'sobre', 'esta', 'este', 'pasa', 'hacer']);
const EN_HINTS = new Set(['what', 'how', 'which', 'where', 'when', 'why', 'the', 'is', 'are', 'do', 'does', 'of', 'to',
  'for', 'in', 'a', 'an', 'and', 'with', 'my', 'can', 'who', 'many', 'much', 'hi', 'hello', 'thanks', 'documents',
  'about', 'list', 'show', 'tell', 'should', 'did', 'we', 'have']);

export function detectLanguage(text) {
  if (/[¿¡ñáéíóú]/i.test(text)) return 'es';
  const words = normalize(text).split(' ');
  let es = 0, en = 0;
  for (const w of words) {
    if (ES_HINTS.has(w)) es++;
    if (EN_HINTS.has(w)) en++;
  }
  return en > es ? 'en' : 'es';
}
