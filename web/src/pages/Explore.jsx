import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { addQuery } from '../session.js';
import { Bar, CATEGORIES, CAT_ES, CategoryChip, CONCEPT_BY_ID, DOCS, useDocViewer } from '../ui.jsx';
import { ForYou } from './Chat.jsx';

export default function Explore() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState(null);
  const [cat, setCat] = useState('all');
  const [loading, setLoading] = useState(false);
  const { open } = useDocViewer();

  useEffect(() => {
    if (!submitted) { setResults(null); return; }
    setLoading(true);
    api.search(submitted, 12).then(setResults).catch(() => setResults({ results: [], error: true })).finally(() => setLoading(false));
  }, [submitted]);

  const list = useMemo(() => {
    if (results) return results.results.map((r) => ({ ...DOCS.find((d) => d.id === r.id), hit: r }));
    return DOCS;
  }, [results]);
  const shown = list.filter((d) => cat === 'all' || d.category === cat);
  const maxScore = results?.results?.[0]?.score || 1;

  function submit(e) {
    e.preventDefault();
    const v = q.trim();
    setSubmitted(v);
    if (v) addQuery(v);
  }

  return (
    <div className="chat-layout">
      <section>
        <h1 className="page-title">Explorar el repositorio</h1>
        <p className="lead">Búsqueda semántica en español o inglés. Ordena por similitud coseno TF-IDF más un refuerzo por conceptos de la ontología.</p>
        <form className="composer search" onSubmit={submit} role="search">
          <label htmlFor="search-input" className="sr-only">Buscar documentos</label>
          <input id="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. ruido en la cabina, supplier delivery, cómo evitar lesiones…" />
          <button className="btn primary" type="submit">Buscar</button>
          {submitted && <button type="button" className="btn" onClick={() => { setQ(''); setSubmitted(''); }}>Ver todos</button>}
        </form>
        <div className="chips filter" role="group" aria-label="Filtrar por categoría">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Todas</button>
          {CATEGORIES.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CAT_ES[c]}</button>)}
        </div>
        {results?.concepts?.length > 0 && (
          <p className="muted small">Conceptos detectados en tu búsqueda: {results.concepts.map((c) => CONCEPT_BY_ID[c]?.name_es || c).join(', ')}</p>
        )}
        {loading && <p className="muted">Buscando…</p>}
        {results && !loading && !shown.length && <p className="empty">Sin resultados para «{submitted}». Prueba con otras palabras.</p>}
        <p className="muted small">{shown.length} documentos</p>
        <div className="doc-grid">
          {shown.map((d) => (
            <button key={d.id} className="doc-card" onClick={() => open(d.id)}>
              <span className="rec-top"><span className="doc-id">{d.id}</span><CategoryChip category={d.category} small /></span>
              <span className="doc-card-title">{d.title_es}</span>
              <span className="doc-card-text">{d.hit?.snippet || d.text_es}</span>
              {d.hit && (
                <span className="hit-score">
                  <Bar value={d.hit.score} max={maxScore} label={`similitud ${d.hit.score.toFixed(2)}`} />
                  <span className="score">{d.hit.score.toFixed(2)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
      <ForYou />
    </div>
  );
}
