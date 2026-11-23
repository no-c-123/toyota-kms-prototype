import React from 'react';
import { useHashRoute } from './session.js';
import { DocViewerProvider } from './ui.jsx';
import Chat from './pages/Chat.jsx';
import Explore from './pages/Explore.jsx';
import Classify from './pages/Classify.jsx';
import Graph from './pages/Graph.jsx';
import Metrics from './pages/Metrics.jsx';
import About from './pages/About.jsx';

const PAGES = [
  { id: 'asistente', label: 'Asistente', el: Chat },
  { id: 'explorar', label: 'Explorar', el: Explore },
  { id: 'clasificar', label: 'Clasificar', el: Classify },
  { id: 'grafo', label: 'Grafo', el: Graph },
  { id: 'metricas', label: 'Métricas', el: Metrics },
  { id: 'acerca', label: 'Cómo funciona', el: About },
];

export default function App() {
  const [route, go] = useHashRoute('asistente');
  const page = PAGES.find((p) => p.id === route) || PAGES[0];
  const Page = page.el;
  return (
    <DocViewerProvider>
      <header className="topbar">
        <a className="brand" href="#/asistente" aria-label="Inicio">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">SGC Toyota</span>
            <span className="brand-sub">Sistema de gestión del conocimiento · prototipo académico</span>
          </span>
        </a>
        <nav className="tabs" aria-label="Secciones">
          {PAGES.map((p) => (
            <button key={p.id} className={p.id === page.id ? 'tab on' : 'tab'} aria-current={p.id === page.id ? 'page' : undefined} onClick={() => go(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
      </header>
      <main className={`page page-${page.id}`}>
        <Page go={go} />
      </main>
      <footer className="footer">
        Proyecto final · Sistemas y tecnologías de administración del conocimiento · Tecmilenio · Héctor Leal y Héctor Kuri.
        Documentos simulados con fines académicos; no es un sistema oficial de Toyota.
      </footer>
    </DocViewerProvider>
  );
}
