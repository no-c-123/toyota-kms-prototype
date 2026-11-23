# Toyota Knowledge Management System (SGC Toyota)

Final project for **Sistemas y tecnologías de administración del conocimiento** (Tecmilenio).
Authors: Héctor Emiliano Leal Prieto, Héctor Kuri Aguirre · Professor: Jonathan Alexis Puente Guerrero.

An integrated knowledge management prototype for a Toyota plant (fictional scenario, simulated documents).
It answers questions in Spanish or English, recommends related documents, classifies new documents and
shows how the organization's knowledge is connected.

**Live demo:** `https://<your-project>.vercel.app` (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))

| Component | What it does | Where |
| --- | --- | --- |
| Automated classification | TF-IDF + Logistic Regression, 6 categories, Spanish and English | `ml/classifier.py`, `web/lib/engine/classify.js` |
| Recommendation system | Related documents (cosine + ontology) and "for you" suggestions from search history | `ml/recommender.py`, `web/lib/engine/recommend.js` |
| Chatbot | Rules + context retrieval + extractive answers with sources; optional LLM wording | `web/lib/engine/chatbot.js`, `web/api/chat.js` |
| Knowledge graph | Expanded ontology (142 nodes, 416 relations), NetworkX + PyVis + interactive web view | `ml/knowledge_graph.py`, `web/src/pages/Graph.jsx` |
| Evaluation | Accuracy, precision/recall, recommendation quality, accessibility audit | `web/scripts/evaluate.mjs`, `web/scripts/usability-audit.mjs` |

## Results

| Metric | Result |
| --- | --- |
| Chatbot accuracy, held-out test set (49 questions) | **85.7%** (goal ≥ 70%) |
| Chatbot accuracy, development set (51 questions) | 92.2% |
| Retrieval precision@1 / recall@3 / MRR (test) | 92.1% / 100% / 0.961 |
| Follow-up questions answered with context (test) | 4 of 4 |
| Classification accuracy, grouped cross-validation | **83.2%** (Phase 1: 70.8%) |
| Related-document precision@5, same category | 75% (random: 15%) |
| History recommendations precision@5, same category | 83% |
| Accessibility audit (axe-core, WCAG 2.1 AA, 12 page views) | 0 violations |

Full numbers and method: [docs/EVALUATION.md](docs/EVALUATION.md) and the **Métricas** page of the app.

## Architecture

```
data/ (72 bilingual documents, 44 concepts, eval questions)
   │
   ▼
ml/  Python pipeline (offline) ── classifier · recommender · knowledge graph · build_artifacts
   │        exports
   ▼
web/lib/data/kb.js  (search index, classifier weights, recommendations, ontology)
   │        bundled with
   ▼
web/api/*.js  Vercel serverless functions (Node) ── /api/chat · /api/search · /api/recommend · /api/classify
   │        JSON
   ▼
web/src/  React + Vite frontend ── Asistente · Explorar · Clasificar · Grafo · Métricas · Cómo funciona
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it locally

```bash
# 1. Python pipeline (only needed after changing /data)
cd ml
pip install -r requirements.txt
python classifier.py          # cross-validation report
python recommender.py         # recommendation quality
python knowledge_graph.py     # graph.json + knowledge_graph.html (PyVis)
python build_artifacts.py     # writes web/lib/data/kb.js
python check_parity.py        # Python and JavaScript process text identically

# 2. Web app + API
cd ../web
npm install
npm run dev                   # http://localhost:5173 (API on :3001)
npm test                      # API smoke tests
npm run evaluate              # chatbot / retrieval / recommendation metrics
```

## Repository layout

```
data/          documents.json, concepts.json, eval/ (dev and frozen test questions)
ml/            Python pipeline and reports (ml/output/)
web/           React app, serverless API (web/api), engine (web/lib/engine), scripts
docs/          architecture, evaluation, deployment, user guide, screenshots
phase1/        Phase 1 prototype (48 English documents) kept for comparison
```

Academic prototype. Documents are simulated from public information; this is not an official Toyota system.
