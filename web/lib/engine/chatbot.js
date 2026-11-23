// Chatbot for natural-language questions over the document repository.
// Hybrid design: simple rules for intents (greeting, help, definitions, category lists)
// + context retrieval (search.js) + extractive answers built from the best document's sentences.
import kb from '../data/kb.js';
import { detectLanguage, normalize, tokens } from './text.js';
import { CONCEPT_BY_ID, DOCS, detectConcepts, search, snippet } from './search.js';
import { related } from './recommend.js';

const CAT_ES = kb.meta.categories_es;

const CATEGORY_KEYWORDS = {
  Manufacturing: ['manufactura', 'produccion', 'manufacturing', 'production'],
  Quality: ['calidad', 'quality'],
  Safety: ['seguridad', 'safety'],
  'R&D': ['i d', 'investigacion y desarrollo', 'investigacion', 'research', 'r d', 'ingenieria de producto'],
  'Supply Chain': ['cadena de suministro', 'suministro', 'logistica', 'supply chain', 'logistics'],
  'HR & Training': ['capacitacion', 'recursos humanos', 'entrenamiento', 'training', 'human resources', 'rh', 'hr'],
};
const LIST_WORDS = /(^| )(documentos?|docs?|documents?|lista|listar|list|muestrame|show me|que hay|archivos|reportes)( |$)/;
const LIST_STEMS = new Set(['docum', 'docs', 'lista', 'list', 'muest', 'archi', 'repor', 'hay']);
const DEFINE_WORDS = /(^| )(que es|que son|que significa|que significan|que quiere decir|significado de|definicion de|define|explicame|explica|what is|what are|what does|whats|meaning of|explain)( |$)/;
const DEFINE_STEMS = new Set(['signi', 'quier', 'decir', 'defin', 'mean', 'meani', 'expli', 'conce']);
const GREETING = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hi|hello|hey|que tal|saludos)( |$)/;
const THANKS = /(^| )(gracias|thanks|thank you|muchas gracias|perfecto|excelente)( |$)/;
const HELP = /(que puedes hacer|que sabes|como funcionas|como te uso|ayuda|help|what can you do|how do you work)/;
const FOLLOW_UP = /^(y|and|e|tambien|also|entonces|so)( |$)|(^| )(eso|esto|ese|esa|aquel|ahi|alli|it|that|this|those|them|they|its|su|sus)( |$)/;

const T = {
  es: {
    greeting: 'Hola. Soy el asistente del sistema de gestión del conocimiento de Toyota (prototipo académico). Pregúntame sobre procedimientos, reportes, políticas o conceptos del TPS y te respondo con base en los documentos.',
    help: 'Puedo: (1) responder preguntas con base en los 72 documentos, (2) explicar conceptos como andon, kanban o jidoka, (3) listar los documentos de una categoría y (4) recomendarte documentos relacionados. Prueba con «¿Qué hago si se derrama solvente?» o «¿Qué es el heijunka?».',
    thanks: 'Con gusto. ¿Te ayudo con algo más?',
    fallback: 'No encontré información sobre eso en los documentos del sistema. Solo puedo responder con base en el repositorio de Toyota (manufactura, calidad, seguridad, I+D, cadena de suministro y capacitación).',
    try: 'Puedes intentar con:',
    according: 'Según',
    alsoSee: 'También puede servirte:',
    definitionOf: 'Concepto',
    partOf: 'Es parte de',
    appliedIn: 'Lo encuentras aplicado en',
    noDocs: 'Aún no hay documentos que lo mencionen directamente.',
    listIntro: (cat, n) => `Hay ${n} documentos de ${cat}:`,
  },
  en: {
    greeting: "Hi. I'm the assistant of Toyota's knowledge management system (academic prototype). Ask me about procedures, reports, policies or TPS concepts and I'll answer from the documents.",
    help: 'I can: (1) answer questions from the 72 documents, (2) explain concepts such as andon, kanban or jidoka, (3) list the documents of a category and (4) recommend related documents. Try "What should I do if solvent spills?" or "What is heijunka?".',
    thanks: "You're welcome. Anything else?",
    fallback: "I couldn't find that in the system's documents. I can only answer from Toyota's repository (manufacturing, quality, safety, R&D, supply chain and training).",
    try: 'You could try:',
    according: 'According to',
    alsoSee: 'You may also find useful:',
    definitionOf: 'Concept',
    partOf: 'Part of',
    appliedIn: 'You can see it applied in',
    noDocs: 'No document mentions it directly yet.',
    listIntro: (cat, n) => `There are ${n} ${cat} documents:`,
  },
};

const title = (d, lang) => d[`title_${lang}`];
const catName = (c, lang) => (lang === 'es' ? CAT_ES[c] : c);
const conceptName = (c, lang) => c[`name_${lang}`];

function detectCategory(norm) {
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some((k) => ` ${norm} `.includes(` ${k} `))) return cat;
  }
  return null;
}

function categoryTokens(cat) {
  return new Set(CATEGORY_KEYWORDS[cat].flatMap((k) => tokens(k)));
}

function pickDefinitionConcept(norm, concepts) {
  // the concept whose keyword is the longest match is the one being asked about
  let best = null, bestLen = 0;
  for (const c of concepts) {
    for (const k of c.keywords) {
      if (` ${norm} `.includes(` ${k} `) && k.length > bestLen) { best = c; bestLen = k.length; }
    }
  }
  return best;
}

function suggestionsFor(lang) {
  return lang === 'es'
    ? ['¿Qué hago si un operador jala el cordón andon?', '¿Qué es el kanban?', '¿Qué documentos hay de seguridad?']
    : ['What should the team leader do when the andon is pulled?', 'What is kanban?', 'List the safety documents'];
}

function lastAnsweredTurn(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.role === 'assistant' && h.primaryDocId) {
      const user = [...history.slice(0, i)].reverse().find((x) => x.role === 'user');
      return { docId: h.primaryDocId, query: user?.content || '' };
    }
  }
  return null;
}

/**
 * @param {string} message
 * @param {Array<{role:'user'|'assistant', content:string, primaryDocId?:string}>} history
 */
export function chat(message, history = []) {
  const lang = detectLanguage(message);
  const t = T[lang];
  const norm = normalize(message);
  const content = tokens(message);
  const base = { lang, mode: 'retrieval', sources: [], related: [], suggestions: [], usedContext: false };

  if (!norm) return { ...base, intent: 'help', answer: t.help, suggestions: suggestionsFor(lang) };

  // --- rules: small talk -------------------------------------------------------------------
  if (GREETING.test(norm) && content.length <= 2) return { ...base, intent: 'greeting', answer: t.greeting, suggestions: suggestionsFor(lang) };
  if (THANKS.test(norm) && content.length <= 2) return { ...base, intent: 'thanks', answer: t.thanks };
  if (HELP.test(norm) && content.length <= 3) return { ...base, intent: 'help', answer: t.help, suggestions: suggestionsFor(lang) };

  // --- rule: list a category -----------------------------------------------------------------
  const cat = detectCategory(norm);
  if (cat && LIST_WORDS.test(norm)) {
    const catToks = categoryTokens(cat);
    const rest = content.filter((tk) => !LIST_STEMS.has(tk) && !catToks.has(tk));
    if (rest.length <= 1) {
      const docs = DOCS.filter((d) => d.category === cat);
      const lines = docs.map((d) => `• ${d.id} — ${title(d, lang)}`).join('\n');
      return {
        ...base, intent: 'list', category: cat,
        answer: `${t.listIntro(catName(cat, lang), docs.length)}\n${lines}`,
        sources: docs.map((d) => ({ id: d.id, title: title(d, lang), category: d.category, score: null })),
      };
    }
  }

  // --- rule: define a concept from the ontology ----------------------------------------------
  const concepts = detectConcepts(message);
  if (concepts.length && DEFINE_WORDS.test(norm)) {
    const c = pickDefinitionConcept(norm, concepts);
    const kwToks = new Set(c.keywords.flatMap((k) => tokens(k)));
    const rest = content.filter((tk) => !kwToks.has(tk) && !DEFINE_STEMS.has(tk));
    if (rest.length <= 1) {
      const docs = DOCS.filter((d) => d.concepts.includes(c.id));
      const parent = c.parent ? CONCEPT_BY_ID.get(c.parent) : null;
      let answer = `**${conceptName(c, lang)}**: ${c[`definition_${lang}`]}`;
      if (parent) answer += `\n${t.partOf}: ${conceptName(parent, lang)}.`;
      answer += docs.length
        ? `\n${t.appliedIn}: ${docs.slice(0, 4).map((d) => `${d.id} (${title(d, lang)})`).join('; ')}.`
        : `\n${t.noDocs}`;
      return {
        ...base, intent: 'definition', conceptId: c.id, answer,
        sources: docs.slice(0, 4).map((d) => ({ id: d.id, title: title(d, lang), category: d.category, score: null })),
        primaryDocId: docs[0]?.id,
        suggestions: parent ? [lang === 'es' ? `¿Qué es ${conceptName(parent, lang)}?` : `What is ${conceptName(parent, lang)}?`] : [],
      };
    }
  }

  // --- retrieval ------------------------------------------------------------------------------
  const prev = lastAnsweredTurn(history);
  let res = search(message);
  let usedContext = false;
  if (prev && (FOLLOW_UP.test(norm) || content.length <= 3)) {
    const withCtx = search(message, { contextQuery: prev.query });
    // keep the follow-up reading unless the question clearly stands on its own
    if (!(res.confident && res.results[0].score >= 0.3 && res.results[0].id !== withCtx.results[0].id)) {
      res = withCtx; usedContext = true;
    }
  }

  const top = res.results[0];
  if (!res.knownTokens.length || !res.confident) {
    return {
      ...base, intent: 'fallback', answer: t.fallback, confidence: top ? Number(top.score.toFixed(3)) : 0,
      suggestions: suggestionsFor(lang),
      sources: res.knownTokens.length ? res.results.slice(0, 3).map((r) => ({ id: r.id, title: title(r.doc, lang), category: r.doc.category, score: Number(r.score.toFixed(3)) })) : [],
    };
  }

  const doc = top.doc;
  const text = snippet(doc, lang, res.queryVector);
  let answer = `${t.according} **${title(doc, lang)}** (${doc.id} · ${catName(doc.category, lang)}): ${text}`;
  const second = res.results[1];
  if (second && second.score >= 0.75 * top.score) {
    answer += `\n${t.alsoSee} ${second.id} — ${title(second.doc, lang)}.`;
  }
  const docConcepts = doc.concepts.map((id) => CONCEPT_BY_ID.get(id)).filter((c) => c && c.kind === 'concept' && c.doc_count <= 6);
  return {
    ...base,
    intent: 'answer', usedContext,
    answer,
    primaryDocId: doc.id,
    confidence: Number(top.score.toFixed(3)),
    concepts: res.concepts,
    sources: res.results.slice(0, 3).map((r) => ({ id: r.id, title: title(r.doc, lang), category: r.doc.category, score: Number(r.score.toFixed(3)) })),
    related: related(doc.id, 3).map((r) => ({ id: r.id, title: title(r.doc, lang), category: r.doc.category, score: r.score })),
    suggestions: docConcepts.slice(0, 2).map((c) => (lang === 'es' ? `¿Qué es ${conceptName(c, lang)}?` : `What is ${conceptName(c, lang)}?`)),
    context: { snippetDocs: res.results.slice(0, 3).map((r) => r.id) },
  };
}
