"""
Component 4 - Knowledge graph (refined ontology from Phase 1).

Phase 1 had 4 node types and 142 triples drawn as a static image. Phase 2 expands the ontology:

  node types   document, category, concept, TPS / Toyota Way principle, document type, department
  edge types   classified_as   document  -> category
               describes       document  -> concept / principle   (found automatically in the text)
               supports        concept   -> principle
               pillar_of       principle -> principle (e.g. Jidoka -> TPS)
               is_a            document  -> document type
               owned_by        document  -> department
               related_to      document  -> document  (content recommender, score >= threshold)

Outputs:
  web/src/data/graph.json          interactive graph in the React app
  ml/output/knowledge_graph.html   stand-alone PyVis version (open in any browser)
  ml/output/graph_report.json      size and centrality statistics
  ml/output/knowledge_graph.png    static overview

Run:  python knowledge_graph.py
"""

import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import networkx as nx
from pyvis.network import Network

from common import CATEGORY_ES, OUT, WEB_SRC_DATA, load_concepts, load_documents
from recommender import content_recommendations, link_concepts

RELATED_THRESHOLD = 0.15
TYPE_ES = {"Standardized work": "Trabajo estandarizado", "Procedure": "Procedimiento", "Report": "Reporte",
           "Plan": "Plan", "Policy": "Política", "Training": "Capacitación", "Specification": "Especificación",
           "Analysis": "Análisis"}
DEPT_ES = {"Assembly": "Ensamble", "Paint": "Pintura", "Body and Welding": "Carrocería y soldadura",
           "Stamping": "Estampado", "Maintenance": "Mantenimiento", "Engine": "Motores",
           "Quality Engineering": "Ingeniería de calidad", "Safety": "Seguridad industrial", "R&D": "I+D",
           "Logistics": "Logística", "Purchasing": "Compras", "Human Resources": "Recursos humanos"}
COLORS = {"document": "#F2C14E", "category": "#3B82C4", "concept": "#9AA0A6", "principle": "#C8102E",
          "type": "#7FB77E", "department": "#B48EAD"}


def build_graph():
    docs, concepts = load_documents(), load_concepts()
    links = link_concepts(docs, concepts)
    recs, _, _ = content_recommendations(docs, links, top_k=3)
    G = nx.DiGraph()

    for c, es in CATEGORY_ES.items():
        G.add_node(f"cat:{c}", kind="category", label_en=c, label_es=es)
    for p in concepts["principles"]:
        G.add_node(f"concept:{p['id']}", kind="principle", label_en=p["name_en"], label_es=p["name_es"],
                   definition_es=p["definition_es"], definition_en=p["definition_en"])
    for p in concepts["principles"]:
        if p["parent"]:
            G.add_edge(f"concept:{p['id']}", f"concept:{p['parent']}", relation="pillar_of")
    for c in concepts["concepts"]:
        G.add_node(f"concept:{c['id']}", kind="concept", label_en=c["name_en"], label_es=c["name_es"],
                   definition_es=c["definition_es"], definition_en=c["definition_en"])
        if c.get("principle"):
            G.add_edge(f"concept:{c['id']}", f"concept:{c['principle']}", relation="supports")
    for t, es in TYPE_ES.items():
        G.add_node(f"type:{t}", kind="type", label_en=t, label_es=es)
    for d in docs:
        dep = d["department"]
        if f"dept:{dep}" not in G:
            G.add_node(f"dept:{dep}", kind="department", label_en=dep, label_es=DEPT_ES.get(dep, dep))
        G.add_node(d["id"], kind="document", label_en=d["title_en"], label_es=d["title_es"], category=d["category"])
        G.add_edge(d["id"], f"cat:{d['category']}", relation="classified_as")
        G.add_edge(d["id"], f"type:{d['type']}", relation="is_a")
        G.add_edge(d["id"], f"dept:{dep}", relation="owned_by")
        for cid in links[d["id"]]:
            G.add_edge(d["id"], f"concept:{cid}", relation="describes")
    for a, rs in recs.items():
        for r in rs:
            if r["score"] >= RELATED_THRESHOLD and not G.has_edge(r["id"], a):
                G.add_edge(a, r["id"], relation="related_to", weight=r["score"])
    return G, docs


def report(G):
    U = G.to_undirected()
    rel_counts = {}
    for _, _, data in G.edges(data=True):
        rel_counts[data["relation"]] = rel_counts.get(data["relation"], 0) + 1
    kinds = {}
    for _, data in G.nodes(data=True):
        kinds[data["kind"]] = kinds.get(data["kind"], 0) + 1
    concept_nodes = [n for n, d in G.nodes(data=True) if d["kind"] in ("concept", "principle")]
    btw = nx.betweenness_centrality(U)
    top_concepts = sorted(concept_nodes, key=lambda n: U.degree(n), reverse=True)[:8]
    docs_by_btw = sorted([n for n, d in G.nodes(data=True) if d["kind"] == "document"], key=btw.get, reverse=True)[:5]
    return {
        "nodes": G.number_of_nodes(), "edges": G.number_of_edges(),
        "node_types": kinds, "relations": rel_counts,
        "connected_components": nx.number_connected_components(U),
        "density": round(nx.density(U), 4),
        "most_connected_concepts": [{"id": n, "label_es": G.nodes[n]["label_es"], "degree": U.degree(n)} for n in top_concepts],
        "bridge_documents": [{"id": n, "betweenness": round(btw[n], 4)} for n in docs_by_btw],
        "phase1_reference": {"node_types": 4, "triples": 142},
    }


def export_web(G):
    nodes = [{"id": n, **{k: v for k, v in d.items()}} for n, d in G.nodes(data=True)]
    U = G.to_undirected()
    for node in nodes:
        node["degree"] = U.degree(node["id"])
    edges = [{"source": a, "target": b, "relation": d["relation"], **({"weight": d["weight"]} if "weight" in d else {})}
             for a, b, d in G.edges(data=True)]
    (WEB_SRC_DATA / "graph.json").write_text(json.dumps({"nodes": nodes, "links": edges}, ensure_ascii=False),
                                             encoding="utf-8")


def export_pyvis(G):
    net = Network(height="820px", width="100%", directed=True, bgcolor="#FAF8F4", font_color="#1C1C1C",
                  cdn_resources="remote")
    sizes = {"category": 28, "principle": 24, "concept": 14, "document": 10, "type": 12, "department": 12}
    for n, d in G.nodes(data=True):
        title = d["label_es"] + (f" — {d.get('definition_es', '')}" if d.get("definition_es") else "")
        net.add_node(n, label=d["label_es"] if d["kind"] != "document" else n, title=title,
                     color=COLORS[d["kind"]], size=sizes[d["kind"]])
    for a, b, d in G.edges(data=True):
        net.add_edge(a, b, title=d["relation"], color="#C9C4BB", arrows="to")
    net.barnes_hut(gravity=-6000, spring_length=120)
    net.save_graph(str(OUT / "knowledge_graph.html"))


def export_png(G):
    U = G.to_undirected()
    keep = [n for n, d in G.nodes(data=True) if d["kind"] in ("document", "category", "principle", "concept")]
    H = U.subgraph(keep)
    pos = nx.spring_layout(H, seed=7, k=0.35)
    fig, ax = plt.subplots(figsize=(13, 10))
    nx.draw_networkx_edges(H, pos, ax=ax, edge_color="#D9D4CC", width=0.6)
    for kind, size in [("document", 40), ("concept", 70), ("principle", 220), ("category", 320)]:
        ns = [n for n in H if G.nodes[n]["kind"] == kind]
        nx.draw_networkx_nodes(H, pos, nodelist=ns, node_color=COLORS[kind], node_size=size, ax=ax, label=kind)
    labels = {n: G.nodes[n]["label_es"] for n in H if G.nodes[n]["kind"] in ("category", "principle")}
    nx.draw_networkx_labels(H, pos, labels, font_size=9, ax=ax)
    ax.legend(scatterpoints=1, loc="lower left", frameon=False)
    ax.set_title("Grafo de conocimiento Toyota KMS: documentos, conceptos, principios y categorías")
    ax.axis("off"); fig.tight_layout(); fig.savefig(OUT / "knowledge_graph.png", dpi=140)


def main():
    G, _ = build_graph()
    rep = report(G)
    export_web(G); export_pyvis(G); export_png(G)
    (OUT / "graph_report.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Nodes: {rep['nodes']}  Edges: {rep['edges']}  Components: {rep['connected_components']}")
    print("Node types:", rep["node_types"])
    print("Relations:", rep["relations"])
    print("Most connected concepts:", [(c["label_es"], c["degree"]) for c in rep["most_connected_concepts"]])


if __name__ == "__main__":
    main()
