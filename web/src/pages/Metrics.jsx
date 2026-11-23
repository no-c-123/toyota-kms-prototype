import React, { useState } from 'react';
import metrics from '../data/metrics.json';
import { Bar, CAT_COLOR, CAT_ES, CATEGORIES } from '../ui.jsx';

const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const KIND_ES = { document_question: 'Preguntas sobre documentos', definition: 'Definiciones de conceptos', category_list: 'Listas por categoría', out_of_scope: 'Preguntas fuera de alcance' };
const MODEL_ES = {
  'Phase 1 baseline (English words, no stemming) + Logistic Regression': 'Base fase 1 (sin manejo de español ni raíces)',
  'Naive Bayes': 'Naive Bayes', 'Linear SVM': 'SVM lineal',
  'Logistic Regression (C=10)': 'Regresión logística (C=10)', 'Logistic Regression (C=30)': 'Regresión logística (C=30) · elegida',
};

function Stat({ value, label, note, accent }) {
  return (
    <div className={`stat ${accent ? 'accent' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

function Row({ label, value, max = 1, color, text }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <Bar value={value ?? 0} max={max} color={color} label={`${label}: ${text ?? pct(value)}`} />
      <span className="score">{text ?? pct(value)}</span>
    </div>
  );
}

export default function Metrics() {
  const { chatbot, classification: cls, recommender_content: rc, recommender_history: rh, graph, usability } = metrics;
  const t = chatbot.test, d = chatbot.dev;
  return (
    <div className="metrics">
      <h1 className="page-title">Evaluación del sistema</h1>
      <p className="lead">Resultados generados con <code>npm run evaluate</code> sobre el mismo motor que usa el servidor. Última corrida: {new Date(metrics.generated_at).toLocaleString('es-MX')}.</p>

      <section className="metric-section">
        <h2>Chatbot</h2>
        <div className="stats">
          <Stat accent value={pct(t.accuracy)} label="Exactitud en el set de prueba" note={`${t.correct} de ${t.n_questions} preguntas · meta ≥ 70%`} />
          <Stat value={pct(d.accuracy)} label="Exactitud en el set de desarrollo" note={`${d.correct} de ${d.n_questions} · usado para ajustar`} />
          <Stat value={pct(t.conversations.accuracy, 0)} label="Preguntas de seguimiento" note={`${t.conversations.n} conversaciones de 2 turnos (prueba)`} />
          <Stat value={`${t.avg_response_ms.toFixed(1)} ms`} label="Tiempo de respuesta del motor" note="promedio por pregunta, sin red" />
        </div>
        <div className="two-col">
          <div className="card">
            <h3>Exactitud por tipo de pregunta (prueba)</h3>
            {Object.entries(t.by_kind).map(([k, v]) => <Row key={k} label={`${KIND_ES[k]} (${v.n})`} value={v.accuracy} />)}
            <Row label={`Español (${t.by_language.es.n})`} value={t.by_language.es.accuracy} color="#5C5F66" />
            <Row label={`Inglés (${t.by_language.en.n})`} value={t.by_language.en.accuracy} color="#5C5F66" />
          </div>
          <div className="card">
            <h3>Recuperación de documentos (prueba)</h3>
            <Row label="Precisión@1" value={t.retrieval.precision_at_1} />
            <Row label="Recall@3" value={t.retrieval.recall_at_3} />
            <Row label="Recall@5" value={t.retrieval.recall_at_5} />
            <Row label="MRR" value={t.retrieval.mrr} text={t.retrieval.mrr.toFixed(3)} />
            <Row label="Precisión al rechazar preguntas fuera de alcance" value={t.out_of_scope_detection.precision} color="#5C5F66" />
            <Row label="Recall al rechazar preguntas fuera de alcance" value={t.out_of_scope_detection.recall} color="#5C5F66" />
          </div>
        </div>
        <p className="note">Metodología: 45 preguntas sueltas + 4 conversaciones por set, en español e inglés, cada una con su documento esperado. El set de prueba se escribió y se guardó en el repositorio antes de ajustar el sistema y no se usó para ajustarlo. Una respuesta cuenta como correcta solo si se basa en el documento esperado (o da la definición, lista o rechazo esperados).</p>
      </section>

      <section className="metric-section">
        <h2>Clasificación automática</h2>
        <div className="stats">
          <Stat accent value={pct(cls.models[cls.chosen_model].accuracy_mean)} label="Exactitud (validación cruzada)" note={`fase 1: ${pct(cls.phase1_reference.cv_accuracy)}`} />
          <Stat value={cls.models[cls.chosen_model].precision_macro.toFixed(2)} label="Precisión macro" />
          <Stat value={cls.models[cls.chosen_model].recall_macro.toFixed(2)} label="Recall macro" />
          <Stat value={cls.models[cls.chosen_model].f1_macro.toFixed(2)} label="F1 macro" />
        </div>
        <div className="two-col">
          <div className="card">
            <h3>Comparación de modelos</h3>
            {Object.entries(cls.models).map(([name, m]) => <Row key={name} label={MODEL_ES[name] || name} value={m.accuracy_mean} color={name === cls.chosen_model ? 'var(--accent)' : '#9A9DA3'} />)}
            <p className="note">{cls.n_documents} documentos × 2 idiomas = {cls.n_samples} muestras. Validación cruzada agrupada: la versión en inglés y en español de un documento siempre caen en el mismo pliegue.</p>
          </div>
          <div className="card">
            <h3>Por categoría</h3>
            <table className="table">
              <thead><tr><th>Categoría</th><th>Precisión</th><th>Recall</th><th>F1</th></tr></thead>
              <tbody>{CATEGORIES.map((c) => (
                <tr key={c}><td><span className="dot" style={{ background: CAT_COLOR[c] }} /> {CAT_ES[c]}</td>
                  <td>{cls.per_class[c].precision.toFixed(2)}</td><td>{cls.per_class[c].recall.toFixed(2)}</td><td>{cls.per_class[c].f1.toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Matriz de confusión (filas: categoría real · columnas: predicción)</h3>
          <div className="confusion">
            <div className="cm-cell head" />
            {CATEGORIES.map((c) => <div key={c} className="cm-cell head">{CAT_ES[c]}</div>)}
            {CATEGORIES.map((r, i) => (
              <React.Fragment key={r}>
                <div className="cm-cell head row">{CAT_ES[r]}</div>
                {cls.confusion_matrix_normalized[i].map((v, j) => (
                  <div key={j} className="cm-cell" style={{ background: `rgba(200,16,46,${0.05 + v * 0.45})`, fontWeight: i === j ? 700 : 400 }}>{Math.round(v * 100)}%</div>
                ))}
              </React.Fragment>
            ))}
          </div>
          <p className="note">Seguridad es la categoría más difícil: varios procedimientos de seguridad hablan de mantenimiento y de la línea, por eso a veces se confunden con Manufactura.</p>
        </div>
      </section>

      <section className="metric-section">
        <h2>Recomendaciones</h2>
        <div className="two-col">
          <div className="card">
            <h3>Documentos relacionados (por contenido)</h3>
            <Row label="Azar" value={rc['random baseline']['precision@5_same_category']} color="#9A9DA3" />
            <Row label="Solo similitud coseno" value={rc['cosine only']['precision@5_same_category']} color="#9A9DA3" />
            <Row label="Coseno + ontología (usado)" value={rc['hybrid (cosine + ontology)']['precision@5_same_category']} />
            <p className="note">Precisión@5 contando como relevante un documento de la misma categoría. Si también cuenta compartir un concepto, el modelo híbrido llega a {pct(rc['hybrid (cosine + ontology)']['precision@5'])}. Cobertura del catálogo: {pct(rc.catalog_coverage, 0)} de los documentos aparece en alguna recomendación.</p>
          </div>
          <div className="card">
            <h3>“Recomendado para ti” (por historial)</h3>
            <Row label="Azar" value={rh.random_baseline_same_category} color="#9A9DA3" />
            <Row label="Precisión@5 · misma categoría" value={rh.precision_at_5_same_category} />
            <Row label="Precisión@5 · categoría o concepto" value={rh.precision_at_5_category_or_concept} />
            <Row label="Sugerencias del tema más reciente tras cambiar de tema" value={rh.recent_topic_share_after_change} color="#5C5F66" />
            <p className="note">{rh.protocol}</p>
          </div>
        </div>
      </section>

      <section className="metric-section">
        <h2>Grafo de conocimiento</h2>
        <div className="stats">
          <Stat value={graph.nodes} label="Nodos" note={`${Object.keys(graph.node_types).length} tipos (fase 1: ${graph.phase1_reference.node_types})`} />
          <Stat value={graph.edges} label="Relaciones" note={`${Object.keys(graph.relations).length} tipos`} />
          <Stat value={graph.connected_components} label="Componentes conectados" note="todo el conocimiento queda enlazado" />
          <Stat value={graph.most_connected_concepts[0].label_es} label="Concepto más conectado" note={`${graph.most_connected_concepts[0].degree} conexiones`} />
        </div>
      </section>

      <section className="metric-section">
        <h2>Usabilidad</h2>
        <div className="two-col">
          <div className="card">
            <h3>Auditoría automática de accesibilidad (WCAG 2.1 AA)</h3>
            {usability ? (
              <>
                <Row label={`Páginas sin violaciones (${usability.pages_audited} revisiones)`} value={usability.details.filter((d) => !d.violations.length).length / usability.pages_audited} color="#2E7D5B" />
                <Row label="Reglas aprobadas por página (promedio)" value={1} text={String(usability.rules_passed_avg)} color="#2E7D5B" />
                <Row label="Páginas con scroll horizontal en móvil" value={usability.pages_with_horizontal_scroll.length / 6} text={String(usability.pages_with_horizontal_scroll.length)} color="#5C5F66" />
                <Row label="Respuesta del chatbot de punta a punta" value={Math.min(1, usability.chat_answer_ms_end_to_end / 1000)} text={`${usability.chat_answer_ms_end_to_end} ms`} color="#5C5F66" />
                <p className="note">{usability.tool}. Se revisaron las 6 secciones en escritorio (1440 px) y móvil (390 px): {usability.total_violations} violaciones.</p>
              </>
            ) : <p className="muted">Pendiente: ejecutar <code>npm run audit</code>.</p>}
          </div>
          <div className="card">
            <h3>Revisión heurística (Nielsen), autoevaluación del equipo</h3>
            <ul className="plain small checks">
              <li><b>Visibilidad del estado:</b> indicador de “escribiendo”, similitud y fuentes en cada respuesta.</li>
              <li><b>Lenguaje del usuario:</b> preguntas en español o inglés con palabras cotidianas (sinónimos como “carro” → vehículo).</li>
              <li><b>Control y libertad:</b> borrar historial, cerrar documentos con Esc, volver a “Ver todos”.</li>
              <li><b>Prevención de errores:</b> respuestas honestas cuando no hay información, en lugar de inventar.</li>
              <li><b>Reconocer en vez de recordar:</b> preguntas sugeridas y conceptos detectados.</li>
              <li><b>Ayuda:</b> el asistente explica qué puede hacer si escribes “ayuda”.</li>
            </ul>
          </div>
        </div>
        <SusForm />
      </section>
    </div>
  );
}

const SUS_ITEMS = [
  'Creo que me gustaría usar este sistema con frecuencia.',
  'Encontré el sistema innecesariamente complejo.',
  'Pensé que el sistema era fácil de usar.',
  'Creo que necesitaría ayuda de una persona con conocimientos técnicos para usarlo.',
  'Las funciones del sistema están bien integradas.',
  'Pensé que había demasiada inconsistencia en el sistema.',
  'Imagino que la mayoría de las personas aprendería a usarlo muy rápido.',
  'Encontré el sistema muy difícil de usar.',
  'Me sentí muy seguro usando el sistema.',
  'Necesité aprender muchas cosas antes de poder usarlo.',
];

function SusForm() {
  const [answers, setAnswers] = useState(Array(10).fill(null));
  const done = answers.every((a) => a != null);
  const score = done ? answers.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5 : null;
  return (
    <div className="card">
      <h3>Cuestionario SUS (System Usability Scale)</h3>
      <p className="note">Para la prueba con usuarios: cada participante usa el sistema 5 minutos y contesta. 1 = totalmente en desacuerdo, 5 = totalmente de acuerdo. Un puntaje mayor a 68 se considera por encima del promedio.</p>
      <ol className="sus">
        {SUS_ITEMS.map((q, i) => (
          <li key={i}>
            <span>{q}</span>
            <span className="sus-scale" role="radiogroup" aria-label={q}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} role="radio" aria-checked={answers[i] === v} className={answers[i] === v ? 'on' : ''} onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}>{v}</button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="sus-result">{done ? <>Puntaje SUS: <strong>{score.toFixed(1)}</strong> / 100</> : `Faltan ${answers.filter((a) => a == null).length} respuestas`}</p>
    </div>
  );
}
