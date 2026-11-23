// Automated classification: multinomial Logistic Regression trained in Python (ml/classifier.py),
// executed here with the exported weights.
import kb from '../data/kb.js';
import { normalize, stem, vectorize } from './text.js';

const C = kb.classifier;
const TERM_BY_INDEX = Object.fromEntries(Object.entries(C.vocab).map(([t, i]) => [i, t]));
// show stems with the user's own words when possible ("inspe" -> "inspectores"), else the corpus word
const readable = (term, own) => term.split('_').map((st) => own.get(st) || C.stem_words[st] || st).join(' ');

export function classify(text, topTerms = 6) {
  const x = vectorize(text, C);
  if (x.size === 0) return { ok: false, reason: 'no-known-words' };
  const logits = C.classes.map((_, k) => {
    let s = C.intercept[k];
    for (const [idx, w] of x) s += C.coef[k][idx] * w;
    return s;
  });
  const m = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = C.classes.map((c, k) => ({ category: c, category_es: kb.meta.categories_es[c], probability: exps[k] / sum }))
    .sort((a, b) => b.probability - a.probability);
  const best = C.classes.indexOf(probs[0].category);
  const own = new Map();
  for (const w of normalize(text).split(' ')) if (w.length > 1 && !own.has(stem(w))) own.set(stem(w), w);
  const evidence = [...x].map(([idx, w]) => ({ term: readable(TERM_BY_INDEX[idx], own), stem: TERM_BY_INDEX[idx], contribution: C.coef[best][idx] * w }))
    .filter((e) => e.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, topTerms);
  return { ok: true, prediction: probs[0], probabilities: probs, evidence, knownTerms: x.size };
}
