import React, { createContext, useContext, useEffect, useState } from 'react';
import documents from './data/documents.json';
import concepts from './data/concepts.json';
import { api } from './api.js';
import { addViewed } from './session.js';

export const DOCS = documents;
export const DOC_BY_ID = Object.fromEntries(documents.map((d) => [d.id, d]));
export const CONCEPT_BY_ID = Object.fromEntries(concepts.map((c) => [c.id, c]));
export const CATEGORIES = ['Manufacturing', 'Quality', 'Safety', 'R&D', 'Supply Chain', 'HR & Training'];
export const CAT_ES = {
  Manufacturing: 'Manufactura', Quality: 'Calidad', Safety: 'Seguridad', 'R&D': 'I+D',
  'Supply Chain': 'Cadena de suministro', 'HR & Training': 'Capacitación',
};
export const CAT_COLOR = {
  Manufacturing: '#2F5F98', Quality: '#2E7D5B', Safety: '#C25E12', 'R&D': '#6A4C93',
  'Supply Chain': '#16808F', 'HR & Training': '#8A6A12',
};

export function CategoryChip({ category, small }) {
  return (
    <span className={`chip cat ${small ? 'small' : ''}`} style={{ '--c': CAT_COLOR[category] }}>
      {CAT_ES[category] || category}
    </span>
  );
}

// **bold** and line breaks only; everything else is plain text (no HTML injection)
export function RichText({ text }) {
  return String(text).split('\n').map((line, i) => (
    <p key={i}>
      {line.split(/(\*\*[^*]+\*\*)/).map((part, j) => (
        part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <React.Fragment key={j}>{part}</React.Fragment>
      ))}
    </p>
  ));
}

export function Bar({ value, max = 1, color, label }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="bar" role="img" aria-label={label || `${pct.toFixed(0)}%`}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color || 'var(--accent)' }} />
    </div>
  );
}

const DocContext = createContext({ open: () => {} });
export const useDocViewer = () => useContext(DocContext);

export function DocViewerProvider({ children }) {
  const [docId, setDocId] = useState(null);
  const open = (id) => { if (DOC_BY_ID[id]) { setDocId(id); addViewed(id); } };
  return (
    <DocContext.Provider value={{ open }}>
      {children}
      {docId && <DocModal id={docId} onClose={() => setDocId(null)} onOpen={open} />}
    </DocContext.Provider>
  );
}

function DocModal({ id, onClose, onOpen }) {
  const d = DOC_BY_ID[id];
  const [lang, setLang] = useState('es');
  const [related, setRelated] = useState(null);
  const [concept, setConcept] = useState(null);
  useEffect(() => {
    setRelated(null); setConcept(null);
    api.related(id).then((r) => setRelated(r.related || [])).catch(() => setRelated([]));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  const c = concept && CONCEPT_BY_ID[concept];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <article className="modal" role="dialog" aria-modal="true" aria-labelledby="doc-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="meta-row">
            <span className="doc-id">{d.id}</span>
            <CategoryChip category={d.category} />
            <span className="muted">{d.type} · {d.department}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="lang-toggle" role="tablist" aria-label="Idioma del documento">
          <button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>Español</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
        </div>
        <h2 id="doc-title">{d[`title_${lang}`]}</h2>
        <p className="doc-text">{d[`text_${lang}`]}</p>
        {d.concepts.length > 0 && (
          <section>
            <h3 className="eyebrow">Conceptos de la ontología</h3>
            <div className="chips">
              {d.concepts.map((cid) => CONCEPT_BY_ID[cid] && (
                <button key={cid} className={`chip concept ${concept === cid ? 'on' : ''}`} onClick={() => setConcept(concept === cid ? null : cid)}>
                  {CONCEPT_BY_ID[cid].name_es}
                </button>
              ))}
            </div>
            {c && <p className="concept-def"><strong>{c.name_es}:</strong> {c.definition_es}</p>}
          </section>
        )}
        <section>
          <h3 className="eyebrow">Documentos relacionados</h3>
          {!related && <p className="muted">Cargando…</p>}
          {related && related.map((r) => (
            <button key={r.id} className="list-item" onClick={() => onOpen(r.id)}>
              <span className="doc-id">{r.id}</span>
              <span className="grow">{r.title_es}</span>
              {r.sharedConcepts.length > 0 && <span className="muted small">{r.sharedConcepts.map((x) => CONCEPT_BY_ID[x]?.name_es || x).join(', ')}</span>}
              <span className="score">{r.score.toFixed(2)}</span>
            </button>
          ))}
        </section>
      </article>
    </div>
  );
}

export function DocLink({ id, title }) {
  const { open } = useDocViewer();
  const d = DOC_BY_ID[id];
  if (!d) return null;
  return (
    <button className="doc-link" onClick={() => open(id)} title={d.title_es}>
      <span className="doc-id">{id}</span> {title || d.title_es}
    </button>
  );
}
