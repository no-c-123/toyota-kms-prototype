import React, { useState } from 'react';
import { api } from '../api.js';
import { Bar, CAT_COLOR, CategoryChip } from '../ui.jsx';

const EXAMPLES = [
  { label: 'Reporte de calidad', text: 'Los inspectores encontraron rayones en las defensas durante la inspección final. Se hizo un análisis de causa raíz y se contuvo el material defectuoso.' },
  { label: 'Procedimiento de seguridad', text: 'Antes de entrar a la celda, el técnico debe colocar su candado personal, usar guantes y lentes de seguridad y confirmar que no hay energía.' },
  { label: 'Supplier notice (EN)', text: 'The supplier will deliver wire harnesses twice a day following the kanban signal to keep inventory low at the plant.' },
  { label: 'Capacitación', text: 'Curso de inducción para personal de nuevo ingreso sobre trabajo estandarizado, valores del Toyota Way y mentoría con el líder de equipo.' },
];

export default function Classify() {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(t = text) {
    if (t.trim().length < 3) return;
    setBusy(true); setError('');
    try { setRes(await api.classify(t)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Clasificación automática</h1>
      <p className="lead">Pega el texto de un documento nuevo y el modelo (regresión logística sobre TF-IDF, entrenado con 72 documentos en dos idiomas) propone su categoría y explica en qué palabras se basó.</p>
      <div className="chips">
        {EXAMPLES.map((ex) => <button key={ex.label} className="chip" onClick={() => { setText(ex.text); run(ex.text); }}>{ex.label}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="classify-form">
        <label htmlFor="classify-text" className="sr-only">Texto del documento</label>
        <textarea id="classify-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Texto del documento, en español o inglés…" maxLength={5000} />
        <button className="btn primary" type="submit" disabled={busy || text.trim().length < 3}>{busy ? 'Clasificando…' : 'Clasificar'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {res && !res.ok && <p className="empty">El texto no contiene palabras que el modelo conozca. Escribe un poco más sobre el documento.</p>}
      {res?.ok && (
        <div className="result-card">
          <div className="result-head">
            <div>
              <p className="eyebrow">Categoría propuesta</p>
              <p className="result-cat" style={{ color: CAT_COLOR[res.prediction.category] }}>{res.prediction.category_es}</p>
            </div>
            <p className="result-prob"><span>{(res.prediction.probability * 100).toFixed(0)}%</span> de probabilidad</p>
          </div>
          <div className="prob-list">
            {res.probabilities.map((p) => (
              <div key={p.category} className="prob-row">
                <CategoryChip category={p.category} small />
                <Bar value={p.probability} color={CAT_COLOR[p.category]} label={`${p.category_es} ${(p.probability * 100).toFixed(0)}%`} />
                <span className="score">{(p.probability * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          {res.evidence.length > 0 && (
            <>
              <p className="eyebrow">Palabras que más pesaron</p>
              <div className="chips">{res.evidence.map((e) => <span key={e.stem} className="chip evidence">{e.term} <span className="muted">+{e.contribution.toFixed(2)}</span></span>)}</div>
            </>
          )}
          {res.prediction.probability < 0.4 && <p className="muted small">Confianza baja: el texto mezcla temas de varias áreas o es muy corto.</p>}
        </div>
      )}
    </div>
  );
}
