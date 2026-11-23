// Semantic search: TF-IDF cosine similarity + ontology concept boost + conversation context.
import kb from '../data/kb.js';
import { combine, containsPhrase, dot, fromPairs, normalize, tokens, vectorize } from './text.js';

export const DOCS = kb.documents;
export const DOC_BY_ID = new Map(DOCS.map((d) => [d.id, d]));
export const CONCEPTS = kb.concepts;
export const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));
const DOC_VECTORS = kb.index.doc_vectors.map(fromPairs);
const DOC_CONCEPTS = DOCS.map((d) => new Set(d.concepts));
const MAX_CONCEPT_WEIGHT = Math.max(...CONCEPTS.map((c) => c.weight));

// Tunable settings (chosen on the development question set only)
export const SETTINGS = {
  conceptBoost: 0.12,      // added for each query concept a document describes, scaled by concept rarity
  contextWeight: 0.6,      // weight of the previous question when the new one is a follow-up
  minScore: 0.08,          // below this the best match is not trusted
  minCoverage: 0.5,        // share of the question's words that must appear in the best document
};

export function docVector(id) {
  const i = DOCS.findIndex((d) => d.id === id);
  return i >= 0 ? DOC_VECTORS[i] : new Map();
}

// Concepts are spotted on stemmed words, so "se detiene la línea" matches the keyword "detener la línea".
export function detectConcepts(text) {
  const n = normalize(text);
  const stemmed = ` ${tokens(text).join(' ')} `;
  return CONCEPTS.filter((c) => c.keywords.some((k) => containsPhrase(n, k))
    || c.keyword_stems.some((k) => stemmed.includes(` ${k} `)));
}

// Small domain thesaurus for user questions (documents use the formal word, people use the everyday one)
const SYNONYMS = {
  carro: 'vehiculo', coche: 'vehiculo', auto: 'vehiculo', automovil: 'vehiculo', car: 'vehicle',
  material: 'piezas', materiales: 'piezas', refacciones: 'piezas', parts: 'parts',
  problema: 'anomalia', problemas: 'anomalia', problem: 'abnormality', issue: 'abnormality',
  falla: 'defecto', fallas: 'defectos', failure: 'defect',
  jefe: 'supervisor', boss: 'supervisor', lastimar: 'lesion', lastimarse: 'lesiones', hurt: 'injury',
  empleado: 'empleados', trabajador: 'trabajadores', worker: 'workers',
};

export function expandQuery(text) {
  const extra = normalize(text).split(' ').map((w) => SYNONYMS[w]).filter(Boolean);
  return extra.length ? `${text} ${extra.join(' ')}` : text;
}

/**
 * Rank all documents for a query.
 * @param {string} query
 * @param {{ contextQuery?: string, limit?: number }} options
 */
export function search(rawQuery, { contextQuery = null, limit = 5 } = {}) {
  const query = expandQuery(rawQuery);
  let qvec = vectorize(query, kb.index);
  if (contextQuery) qvec = combine([[qvec, 1], [vectorize(contextQuery, kb.index), SETTINGS.contextWeight]]);
  const concepts = detectConcepts(contextQuery ? `${query} ${contextQuery}` : query);

  const scored = DOCS.map((d, i) => {
    const cosine = dot(qvec, DOC_VECTORS[i]);
    let boost = 0;
    const matched = [];
    for (const c of concepts) {
      if (DOC_CONCEPTS[i].has(c.id)) {
        boost += SETTINGS.conceptBoost * (c.weight / MAX_CONCEPT_WEIGHT);
        matched.push(c.id);
      }
    }
    return { id: d.id, score: cosine + boost, cosine, conceptBoost: boost, matchedConcepts: matched };
  }).sort((a, b) => b.score - a.score);

  // coverage: how many of the user's own words the best document actually contains
  const qTokens = [...new Set(tokens(rawQuery))];
  const best = scored[0];
  const bestVec = DOC_VECTORS[DOCS.findIndex((d) => d.id === best.id)];
  const covered = qTokens.filter((t) => kb.index.vocab[t] !== undefined && bestVec.has(kb.index.vocab[t]));
  const coverage = qTokens.length ? covered.length / qTokens.length : 0;

  return {
    results: scored.slice(0, limit).map((r) => ({ ...r, doc: DOC_BY_ID.get(r.id) })),
    concepts: concepts.map((c) => c.id),
    queryTokens: qTokens,
    knownTokens: qTokens.filter((t) => kb.index.vocab[t] !== undefined),
    coverage,
    // trust the match only with enough evidence: two of the user's words found in the document,
    // half of them, or an ontology concept in common
    confident: best.score >= SETTINGS.minScore
      && (covered.length >= 2 || coverage >= SETTINGS.minCoverage || best.conceptBoost > 0),
    queryVector: qvec,
  };
}

export function snippet(doc, lang, qvec, maxSentences = 2) {
  const sents = doc[`sentences_${lang}`];
  const ranked = sents
    .map((s, i) => ({ s, i, score: dot(qvec, vectorize(s, kb.index)) }))
    .sort((a, b) => b.score - a.score);
  let chosen = ranked.slice(0, 1);
  // a short heading-like sentence alone is not an answer: add the next best one
  if (chosen[0].s.length < 70 && ranked.length > 1) chosen = ranked.slice(0, maxSentences);
  return chosen.sort((a, b) => a.i - b.i).map((x) => x.s).join(' ');
}
