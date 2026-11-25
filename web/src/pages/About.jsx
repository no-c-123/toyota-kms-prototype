import React from 'react';

function Box({ x, y, w, h, title, lines = [], accent }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="10" fill={accent ? '#FBE3E6' : '#FFFFFF'} stroke={accent ? '#C8102E' : '#CFC8BC'} strokeWidth={accent ? 2 : 1.2} />
      <text x={x + 16} y={y + 28} fontSize="15" fontWeight="600" fill="#1C1C1C">{title}</text>
      {lines.map((l, i) => <text key={i} x={x + 16} y={y + 52 + i * 19} fontSize="13" fill="#4A4D54">{l}</text>)}
    </g>
  );
}

const Arrow = ({ d, label, lx, ly }) => (
  <g>
    <path d={d} fill="none" stroke="#8C8579" strokeWidth="1.5" markerEnd="url(#arr)" />
    {label && <text x={lx} y={ly} fontSize="12" fill="#6B6E75">{label}</text>}
  </g>
);

export default function About() {
  return (
    <div className="narrow wide">
      <h1 className="page-title">Cómo funciona</h1>
      <p className="lead">Un pipeline de aprendizaje automático en Python prepara el conocimiento; un servidor sin estado en Vercel lo usa para contestar; React lo presenta. El chatbot corre en el servidor, no en el navegador.</p>
      <div className="card arch">
        <svg viewBox="0 0 1000 560" role="img" aria-label="Arquitectura del sistema: datos, pipeline en Python, base de conocimiento, API en Vercel y frontend en React">
          <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8C8579" /></marker></defs>
          <text x="20" y="30" fontSize="13" fontWeight="600" fill="#C8102E" letterSpacing="2">1 · DATOS</text>
          <Box x={20} y={45} w={280} h={120} title="data/" lines={['documents.json · 72 docs ES/EN', 'concepts.json · 44 conceptos', 'eval/ · preguntas de prueba']} />
          <text x="360" y="30" fontSize="13" fontWeight="600" fill="#C8102E" letterSpacing="2">2 · PIPELINE (PYTHON, OFFLINE)</text>
          <Box x={360} y={45} w={300} h={210} title="ml/" lines={['text_processing · normaliza, raíces', 'classifier · TF-IDF + reg. logística', 'recommender · coseno + ontología', 'knowledge_graph · NetworkX + PyVis', 'build_artifacts · exporta kb.js', 'check_parity · Python = JavaScript']} />
          <Box x={720} y={45} w={260} h={120} title="lib/data/kb.js" lines={['índice TF-IDF (4,660 términos)', 'pesos del clasificador', 'recomendaciones y conceptos']} accent />
          <text x="20" y="320" fontSize="13" fontWeight="600" fill="#C8102E" letterSpacing="2">3 · SERVIDOR (VERCEL SERVERLESS, NODE)</text>
          <Box x={20} y={335} w={460} h={200} title="api/ → lib/engine/" lines={['POST /api/chat · reglas + recuperación + respuesta', 'GET  /api/search · búsqueda semántica', 'POST /api/recommend · relacionados e historial', 'POST /api/classify · categoría y evidencia', 'GET  /api/health · estado', 'LLM opcional (ANTHROPIC_API_KEY) para redactar']} accent />
          <text x="540" y="320" fontSize="13" fontWeight="600" fill="#C8102E" letterSpacing="2">4 · INTERFAZ (REACT + VITE)</text>
          <Box x={540} y={335} w={440} h={200} title="src/" lines={['Asistente (chat) · Explorar · Clasificar', 'Grafo interactivo (force-graph)', 'Métricas y cuestionario SUS', 'Historial de sesión en el navegador', '  → alimenta “Recomendado para ti”']} />
          <Arrow d="M300 105 H355" />
          <Arrow d="M660 105 H715" />
          <Arrow d="M850 165 V288 H250 V330" label="se empaqueta con las funciones" lx="420" ly="280" />
          <Arrow d="M540 410 H485" label="JSON" lx="494" ly="400" />
          <Arrow d="M485 470 H535" />
        </svg>
      </div>
      <div className="two-col">
        <div className="card">
          <h3>Flujo de una pregunta al chatbot</h3>
          <ol className="plain small numbered">
            <li>Se detecta el idioma y la intención con reglas (saludo, ayuda, definición, lista por categoría).</li>
            <li>Si es una pregunta, se normaliza (acentos, raíces de 5 letras, sinónimos) y se convierte en vector TF-IDF.</li>
            <li>Si es de seguimiento (“¿y cada cuánto?”), se combina con la pregunta anterior.</li>
            <li>Se calcula la similitud coseno con los 72 documentos y se suma un refuerzo si comparten conceptos de la ontología.</li>
            <li>Si la evidencia no alcanza, el bot dice que no tiene esa información en lugar de inventar.</li>
            <li>Si sí alcanza, arma la respuesta con las oraciones más relevantes del mejor documento, cita la fuente y recomienda documentos relacionados.</li>
          </ol>
        </div>
        <div className="card">
          <h3>Tecnologías</h3>
          <ul className="plain small">
            <li><b>Python:</b> scikit-learn, NumPy, NetworkX, PyVis, matplotlib.</li>
            <li><b>Servidor:</b> funciones serverless de Vercel en Node.js, sin base de datos (el conocimiento viaja con el código).</li>
            <li><b>Frontend:</b> React 18, Vite, react-force-graph.</li>
            <li><b>Calidad:</b> pruebas de paridad Python/JavaScript, evaluación automática y auditoría de accesibilidad con axe-core.</li>
          </ul>
          <h3>Equipo</h3>
          <p className="small">Héctor Emiliano Leal Prieto y Héctor Kuri Aguirre · Tecmilenio · Profesor: Jonathan Alexis Puente Guerrero.</p>
        </div>
      </div>
    </div>
  );
}
