import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import graph from '../data/graph.json';
import { CAT_COLOR, CAT_ES, useDocViewer } from '../ui.jsx';

const KINDS = {
  document: { label: 'Documentos', color: '#E0A526' },
  concept: { label: 'Conceptos', color: '#8D939B' },
  principle: { label: 'Principios TPS / Toyota Way', color: '#C8102E' },
  category: { label: 'Categorías', color: '#2F5F98' },
  type: { label: 'Tipo de documento', color: '#5E9B5D' },
  department: { label: 'Departamentos', color: '#9C7AA8' },
};
const RELATION_ES = {
  classified_as: 'clasificado como', describes: 'describe', supports: 'apoya a', pillar_of: 'pilar de',
  is_a: 'es un(a)', owned_by: 'pertenece a', related_to: 'relacionado con',
};

const nodeColor = (n) => (n.kind === 'category' ? CAT_COLOR[n.label_en] : n.kind === 'document' ? CAT_COLOR[n.category] : KINDS[n.kind].color);

export default function Graph() {
  const [visible, setVisible] = useState({ document: true, concept: true, principle: true, category: true, type: false, department: false });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState({ w: 800, h: 600 });
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const { open } = useDocViewer();

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: Math.max(460, Math.min(720, window.innerHeight - 230)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const nodes = graph.nodes.filter((n) => visible[n.kind]).map((n) => ({ ...n }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }));
    return { nodes, links };
  }, [visible]);

  const neighbors = useMemo(() => {
    if (!selected) return null;
    const out = [];
    for (const l of graph.links) {
      if (l.source === selected.id) out.push({ id: l.target, relation: l.relation, dir: 'out' });
      if (l.target === selected.id) out.push({ id: l.source, relation: l.relation, dir: 'in' });
    }
    return out;
  }, [selected]);
  const neighborIds = useMemo(() => new Set(neighbors?.map((n) => n.id) || []), [neighbors]);
  const byId = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), []);

  function focus(n) {
    setSelected(n);
    const live = data.nodes.find((x) => x.id === n.id);
    if (live && fgRef.current && live.x !== undefined) { fgRef.current.centerAt(live.x, live.y, 600); fgRef.current.zoom(2.6, 600); }
  }

  function onSearch(e) {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = graph.nodes.find((n) => n.id.toLowerCase() === q)
      || graph.nodes.find((n) => n.label_es.toLowerCase().includes(q) || n.label_en.toLowerCase().includes(q));
    if (hit) { if (!visible[hit.kind]) setVisible((v) => ({ ...v, [hit.kind]: true })); setTimeout(() => focus(hit), 50); }
  }

  const grouped = useMemo(() => {
    if (!neighbors) return {};
    const g = {};
    for (const n of neighbors) (g[n.relation] ||= []).push(n);
    return g;
  }, [neighbors]);

  return (
    <div className="graph-layout">
      <section>
        <h1 className="page-title">Grafo de conocimiento</h1>
        <p className="lead">La ontología de la fase 1, ampliada: {graph.nodes.length} nodos y {graph.links.length} relaciones entre documentos, conceptos, principios del TPS, categorías, tipos y departamentos. Haz clic en un nodo para ver sus conexiones.</p>
        <div className="graph-tools">
          <div className="chips" role="group" aria-label="Tipos de nodo visibles">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} className={`chip legend ${visible[k] ? 'on' : ''}`} aria-pressed={visible[k]} onClick={() => setVisible((s) => ({ ...s, [k]: !s[k] }))}>
                <span className="dot" style={{ background: v.color }} />{v.label}
              </button>
            ))}
          </div>
          <form onSubmit={onSearch} className="graph-search" role="search">
            <label htmlFor="graph-q" className="sr-only">Buscar nodo</label>
            <input id="graph-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: andon, SAF-002, kaizen…" />
            <button className="btn" type="submit">Ir</button>
          </form>
        </div>
        <div className="graph-canvas" ref={wrapRef}>
          <ForceGraph2D
            ref={fgRef}
            graphData={data}
            width={size.w}
            height={size.h}
            backgroundColor="#FFFFFF"
            nodeRelSize={4}
            cooldownTicks={120}
            linkColor={(l) => {
              const s = typeof l.source === 'object' ? l.source.id : l.source;
              const t = typeof l.target === 'object' ? l.target.id : l.target;
              return selected && (s === selected.id || t === selected.id) ? 'rgba(200,16,46,0.7)' : 'rgba(120,110,95,0.18)';
            }}
            linkWidth={(l) => (l.relation === 'related_to' ? 1.4 : 0.8)}
            linkLineDash={(l) => (l.relation === 'related_to' ? [3, 2] : null)}
            onNodeClick={(n) => focus(n)}
            onBackgroundClick={() => setSelected(null)}
            nodeCanvasObject={(n, ctx, scale) => {
              const r = n.kind === 'category' ? 9 : n.kind === 'principle' ? 7.5 : n.kind === 'document' ? 3.6 : 4.6;
              const dim = selected && n.id !== selected.id && !neighborIds.has(n.id);
              ctx.globalAlpha = dim ? 0.18 : 1;
              ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = nodeColor(n); ctx.fill();
              if (selected && n.id === selected.id) { ctx.lineWidth = 2 / scale; ctx.strokeStyle = '#1C1C1C'; ctx.stroke(); }
              const showLabel = n.kind === 'category' || n.kind === 'principle' || scale > 2.2 || (selected && (n.id === selected.id || neighborIds.has(n.id)));
              if (showLabel && !dim) {
                const label = n.kind === 'document' ? n.id : n.label_es;
                const fs = Math.max(10 / scale, n.kind === 'category' ? 4.4 : 3.2);
                ctx.font = `${n.kind === 'category' || n.kind === 'principle' ? 600 : 400} ${fs}px "Public Sans", sans-serif`;
                ctx.fillStyle = '#1C1C1C'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.fillText(label, n.x, n.y + r + 1.5);
              }
              ctx.globalAlpha = 1;
            }}
            nodePointerAreaPaint={(n, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, 2 * Math.PI); ctx.fill(); }}
            nodeLabel={(n) => `${n.kind === 'document' ? `${n.id} · ` : ''}${n.label_es}`}
          />
        </div>
        <p className="muted small">Línea punteada: documentos relacionados según el recomendador. Arrastra para mover, rueda para hacer zoom.</p>
      </section>
      <aside className="side-panel" aria-label="Detalle del nodo">
        {!selected && (
          <>
            <h2 className="side-title">Explora las relaciones</h2>
            <p className="muted small">Ejemplos para empezar:</p>
            <div className="chips">
              {['concept:andon', 'concept:jidoka', 'concept:kanban', 'SAF-002', 'cat:Quality'].map((id) => byId[id] && (
                <button key={id} className="chip" onClick={() => focus(byId[id])}>{byId[id].kind === 'document' ? id : byId[id].label_es}</button>
              ))}
            </div>
            <h3 className="eyebrow">Tipos de relación</h3>
            <ul className="plain small">{Object.entries(RELATION_ES).map(([k, v]) => <li key={k}><code>{k}</code> — {v}</li>)}</ul>
          </>
        )}
        {selected && (
          <>
            <p className="eyebrow">{KINDS[selected.kind].label}</p>
            <h2 className="side-title">{selected.kind === 'document' ? `${selected.id} · ` : ''}{selected.label_es}</h2>
            {selected.definition_es && <p className="small">{selected.definition_es}</p>}
            {selected.kind === 'document' && <button className="btn primary small-btn" onClick={() => open(selected.id)}>Abrir documento</button>}
            <p className="muted small">{neighbors.length} conexiones</p>
            {Object.entries(grouped).map(([rel, items]) => (
              <div key={rel} className="rel-group">
                <h3 className="eyebrow">{RELATION_ES[rel] || rel}{items[0].dir === 'in' ? ' (entrante)' : ''}</h3>
                {items.map((it) => {
                  const n = byId[it.id];
                  return (
                    <button key={it.id + it.relation} className="list-item" onClick={() => focus(n)}>
                      <span className="dot" style={{ background: nodeColor(n) }} />
                      <span className="grow">{n.kind === 'document' ? `${n.id} · ` : ''}{n.kind === 'category' ? CAT_ES[n.label_en] : n.label_es}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
