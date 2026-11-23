"""
Toyota Knowledge Management System - Basic Ontology / Conceptual Graph
-----------------------------------------------------------------------
Represents Toyota's organizational knowledge as subject-predicate-object triples:
  * concept-to-concept relations are defined by hand (domain knowledge of TPS)
  * document-to-concept relations ("describes") are derived automatically by
    scanning each document for the concept's keywords

Outputs (in output/):
  ontology_triples.csv   every relation as a triple
  ontology_graph.dot/png conceptual graph drawn with Graphviz

Run:  python ontology.py
"""

import csv
import json
import subprocess
from collections import Counter
from pathlib import Path

BASE = Path(__file__).parent
OUT = BASE / "output"
OUT.mkdir(exist_ok=True)

# ------------------------------------------------------------- classes (T-box)
CLASSES = {
    "Organization": ["Toyota"],
    "TPSPrinciple": ["Toyota Production System", "Jidoka", "Just-in-time", "Kaizen",
                     "Respect for people"],
    "DomainConcept": ["Andon", "Kanban", "Poka-yoke", "Standardized work", "Takt time",
                      "Root cause analysis", "Hybrid battery", "Supplier", "Tacit knowledge"],
    "Category": ["Manufacturing", "Quality", "Safety", "R&D", "Supply Chain", "HR & Training"],
    "DocumentType": ["Standardized work sheet", "Procedure", "Quality report", "Policy",
                     "Training module", "Technical report", "Plan"],
}

# Keywords used to detect that a document describes a concept
CONCEPT_KEYWORDS = {
    "Andon": ["andon"],
    "Kanban": ["kanban"],
    "Poka-yoke": ["poka-yoke", "error proofing"],
    "Standardized work": ["standardized work", "standardized cycle"],
    "Takt time": ["takt time"],
    "Root cause analysis": ["root cause", "5 whys", "8d"],
    "Hybrid battery": ["hybrid battery", "high voltage", "battery"],
    "Supplier": ["supplier"],
    "Tacit knowledge": ["tacit knowledge", "know-how"],
    "Kaizen": ["kaizen", "improvement"],
    "Jidoka": ["jidoka"],
    "Just-in-time": ["just-in-time", "just in time"],
}

# Document type inferred from the title
DOCTYPE_RULES = [
    ("Standardized work sheet", ["standardized work sheet", "operating instructions"]),
    ("Policy", ["policy", "code of conduct", "guidelines"]),
    ("Training module", ["training", "onboarding", "curriculum", "program"]),
    ("Quality report", ["root cause", "inspection", "claims", "nonconformity", "audit",
                        "recall", "statistical", "poka-yoke"]),
    ("Procedure", ["procedure", "lockout", "response"]),
    ("Plan", ["plan", "schedule", "layout", "review"]),
    ("Technical report", []),  # default
]

# ------------------------------------------------------------- hand-made relations
TRIPLES = [
    ("Toyota", "applies", "Toyota Production System"),
    ("Toyota", "organizes knowledge into", "Category"),
    ("Jidoka", "part of", "Toyota Production System"),
    ("Just-in-time", "part of", "Toyota Production System"),
    ("Kaizen", "part of", "Toyota Production System"),
    ("Respect for people", "part of", "Toyota Production System"),
    ("Andon", "implements", "Jidoka"),
    ("Poka-yoke", "implements", "Jidoka"),
    ("Kanban", "implements", "Just-in-time"),
    ("Takt time", "implements", "Just-in-time"),
    ("Standardized work", "basis of", "Kaizen"),
    ("Root cause analysis", "supports", "Kaizen"),
    ("Tacit knowledge", "captured by", "Respect for people"),
    ("Andon", "related to", "Manufacturing"),
    ("Poka-yoke", "related to", "Quality"),
    ("Root cause analysis", "related to", "Quality"),
    ("Kanban", "related to", "Supply Chain"),
    ("Supplier", "related to", "Supply Chain"),
    ("Hybrid battery", "related to", "R&D"),
    ("Hybrid battery", "related to", "Safety"),
    ("Tacit knowledge", "related to", "HR & Training"),
]


def doc_type(title):
    t = title.lower()
    for dtype, words in DOCTYPE_RULES:
        if not words or any(w in t for w in words):
            return dtype


def main():
    docs = json.load(open(BASE / "toyota_documents_v1.json", encoding="utf-8"))
    triples = list(TRIPLES)

    # Document-level relations derived from the corpus
    for d in docs:
        text = (d["title"] + " " + d["text"]).lower()
        triples.append((d["id"], "classified as", d["category"]))
        triples.append((d["id"], "is a", doc_type(d["title"])))
        for concept, words in CONCEPT_KEYWORDS.items():
            if any(w in text for w in words):
                triples.append((d["id"], "describes", concept))

    with open(OUT / "ontology_triples.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["subject", "predicate", "object"])
        w.writerows(triples)

    preds = Counter(p for _, p, _ in triples)
    print("=" * 70)
    print("TOYOTA KMS - ONTOLOGY / CONCEPTUAL GRAPH")
    print("=" * 70)
    print(f"Classes: {len(CLASSES)} | Instances: {sum(len(v) for v in CLASSES.values())} concepts"
          f" + {len(docs)} documents")
    print(f"Triples: {len(triples)}")
    for p, n in preds.most_common():
        print(f"  {p:<26} {n}")

    describes = [(s, o) for s, p, o in triples if p == "describes"]
    by_concept = Counter(o for _, o in describes)
    print("\nDocuments linked to each concept (derived from text):")
    for c, n in by_concept.most_common():
        ids = [s for s, o in describes if o == c]
        print(f"  {c:<20} {n:>2}  {', '.join(ids[:6])}{' ...' if len(ids) > 6 else ''}")

    print("\nExample query: which documents describe Andon, and what principle does it implement?")
    andon_docs = [s for s, o in describes if o == "Andon"]
    print(f"  Andon -> implements -> Jidoka -> part of -> Toyota Production System")
    for s in andon_docs:
        title = next(d["title"] for d in docs if d["id"] == s)
        print(f"  {s}: {title}")

    # ---------------------------------------------------------- Graphviz drawing
    # Draw the concept layer plus one or two documents per concept so the graph stays readable
    shown_docs = {}
    for s, o in describes:
        if o in ("Andon", "Kanban", "Poka-yoke", "Root cause analysis", "Hybrid battery",
                 "Tacit knowledge") and list(shown_docs.values()).count(o) < 2:
            shown_docs.setdefault(s, o)
    style = {
        "Organization": 'shape=box style="rounded,filled" fillcolor="#eb0a1e" fontcolor=white',
        "TPSPrinciple": 'shape=ellipse style=filled fillcolor="#fde2e4"',
        "DomainConcept": 'shape=ellipse style=filled fillcolor="#f2f2f2"',
        "Category": 'shape=box style="rounded,filled" fillcolor="#dbe9f6"',
        "Document": 'shape=note style=filled fillcolor="#fff7d6"',
    }
    kind = {n: k for k, names in CLASSES.items() for n in names}
    titles = {d["id"]: d["title"] for d in docs}
    keep_nodes = set(CLASSES["TPSPrinciple"] + CLASSES["DomainConcept"] + CLASSES["Category"]
                     + ["Toyota"]) | set(shown_docs)
    lines = ['digraph Toyota {', '  rankdir=LR; nodesep=0.25; ranksep=0.9;',
             '  node [fontname="Helvetica" fontsize=11]; edge [fontname="Helvetica" fontsize=9 color="#666666"];']
    for n in sorted(keep_nodes):
        if n in titles:
            t = titles[n] if len(titles[n]) <= 36 else titles[n][:36].rsplit(" ", 1)[0] + "..."
            label = f"{n}\\n{t}"
            lines.append(f'  "{n}" [label="{label}" {style["Document"]}];')
        else:
            lines.append(f'  "{n}" [{style[kind[n]]}];')
    for s, p, o in triples:
        if s in keep_nodes and o in keep_nodes and p != "classified as" or \
           (s in shown_docs and p == "describes" and o == shown_docs[s]) or \
           (s in shown_docs and p == "classified as"):
            if s == "Toyota" and o == "Category":
                continue
            lines.append(f'  "{s}" -> "{o}" [label="{p}"];')
    lines.append("}")
    dot = "\n".join(dict.fromkeys(lines))
    (OUT / "ontology_graph.dot").write_text(dot, encoding="utf-8")
    try:
        subprocess.run(["dot", "-Tpng", "-Gdpi=130", str(OUT / "ontology_graph.dot"),
                        "-o", str(OUT / "ontology_graph.png")], check=True)
        print("\nGraph image written to output/ontology_graph.png")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("\nGraphviz not installed: open output/ontology_graph.dot in any Graphviz viewer.")


if __name__ == "__main__":
    main()
