import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { addQuery, clearHistory, useHistory } from '../session.js';
import { CategoryChip, DocLink, RichText, useDocViewer } from '../ui.jsx';

const STARTERS = [
  '¿Qué hago si un operador jala el cordón andon?',
  '¿Qué hacer si se derrama solvente en pintura?',
  '¿Qué es el heijunka?',
  '¿Cómo se pide material al proveedor con kanban?',
  '¿Qué documentos hay de seguridad?',
  'What permit do I need to enter a paint tank?',
];

const INTENT_LABEL = {
  answer: 'Respuesta del repositorio', definition: 'Definición de la ontología', list: 'Lista por categoría',
  fallback: 'Sin información suficiente', greeting: 'Saludo', help: 'Ayuda', thanks: 'Cierre',
};

export default function Chat() {
  const [messages, setMessages] = useState([{
    role: 'assistant', intent: 'greeting',
    answer: 'Hola. Pregúntame sobre procedimientos, reportes, políticas o conceptos del Sistema de Producción Toyota. Respondo con base en los 72 documentos del repositorio, en español o en inglés.',
  }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput(''); setError('');
    const history = messages.slice(1).map((m) => ({ role: m.role, content: m.role === 'user' ? m.content : m.answer, primaryDocId: m.primaryDocId }));
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setBusy(true);
    addQuery(msg);
    try {
      const res = await api.chat(msg, history);
      setMessages((m) => [...m, { role: 'assistant', ...res }]);
    } catch (e) {
      setError(`No se pudo contactar al servidor (${e.message}). Intenta de nuevo.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-layout">
      <section className="chat-panel" aria-label="Conversación con el asistente">
        <div className="messages" aria-live="polite">
          {messages.map((m, i) => (m.role === 'user'
            ? <div key={i} className="msg user"><p>{m.content}</p></div>
            : <AssistantMessage key={i} m={m} onAsk={send} />))}
          {busy && <div className="msg assistant typing" aria-label="El asistente está escribiendo"><span /><span /><span /></div>}
          <div ref={endRef} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="chat-input" className="sr-only">Escribe tu pregunta</label>
          <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe tu pregunta, por ejemplo: ¿cómo se evita una descarga con baterías híbridas?" maxLength={500} autoComplete="off" />
          <button type="submit" className="btn primary" disabled={busy || !input.trim()}>Enviar</button>
        </form>
        {messages.length <= 1 && (
          <div className="starters">
            <p className="eyebrow">Prueba con</p>
            <div className="chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
      </section>
      <ForYou />
    </div>
  );
}

function AssistantMessage({ m, onAsk }) {
  return (
    <div className={`msg assistant intent-${m.intent}`}>
      <div className="msg-meta">
        <span>{INTENT_LABEL[m.intent] || m.intent}</span>
        {m.mode === 'llm' && <span className="tag">redactado con LLM</span>}
        {m.usedContext && <span className="tag">usó el contexto de la conversación</span>}
        {typeof m.confidence === 'number' && m.intent === 'answer' && <span className="muted">similitud {m.confidence.toFixed(2)}</span>}
      </div>
      <div className="msg-body"><RichText text={m.answer} /></div>
      {m.intent !== 'list' && m.sources?.length > 0 && (
        <div className="msg-section">
          <span className="eyebrow">{m.intent === 'fallback' ? 'Lo más cercano que encontré' : 'Fuentes'}</span>
          <div className="source-list">
            {m.sources.map((s) => (
              <div key={s.id} className="source">
                <DocLink id={s.id} title={s.title} />
                <CategoryChip category={s.category} small />
                {s.score != null && <span className="score">{s.score.toFixed(2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {m.intent === 'list' && (
        <div className="msg-section source-list">{m.sources.map((s) => <DocLink key={s.id} id={s.id} title={s.title} />)}</div>
      )}
      {m.related?.length > 0 && (
        <div className="msg-section">
          <span className="eyebrow">Documentos relacionados</span>
          <div className="chips">{m.related.map((r) => <DocLink key={r.id} id={r.id} title={r.title} />)}</div>
        </div>
      )}
      {m.suggestions?.length > 0 && (
        <div className="chips follow">{m.suggestions.map((s) => <button key={s} className="chip ghost" onClick={() => onAsk(s)}>{s}</button>)}</div>
      )}
    </div>
  );
}

export function ForYou() {
  const history = useHistory();
  const [items, setItems] = useState([]);
  const { open } = useDocViewer();
  useEffect(() => {
    if (!history.queries.length && !history.viewed.length) { setItems([]); return; }
    api.forYou(history.queries, history.viewed).then((r) => setItems(r.forYou || [])).catch(() => setItems([]));
  }, [history]);
  return (
    <aside className="side-panel" aria-label="Recomendaciones según tu historial">
      <h2 className="side-title">Recomendado para ti</h2>
      <p className="muted small">Según tus búsquedas y los documentos que abriste en esta sesión.</p>
      {!items.length && <p className="empty">Haz una pregunta o abre un documento y aquí aparecerán sugerencias.</p>}
      {items.map((r) => (
        <button key={r.id} className="rec" onClick={() => open(r.id)}>
          <span className="rec-top"><span className="doc-id">{r.id}</span><CategoryChip category={r.category} small /></span>
          <span className="rec-title">{r.title_es}</span>
          {r.because && (
            <span className="rec-why">
              {r.because.kind === 'query' ? `Por tu búsqueda «${r.because.value.slice(0, 48)}${r.because.value.length > 48 ? '…' : ''}»` : `Porque abriste ${r.because.value}`}
            </span>
          )}
        </button>
      ))}
      {(history.queries.length > 0 || history.viewed.length > 0) && (
        <button className="link-btn" onClick={clearHistory}>Borrar historial ({history.queries.length} búsquedas, {history.viewed.length} documentos)</button>
      )}
    </aside>
  );
}
