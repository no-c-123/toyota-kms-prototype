# System evaluation

All numbers come from `npm run evaluate` (chatbot, retrieval, history recommender, run on the same engine the
API uses), the Python reports in `ml/output/` and `npm run audit` (accessibility). They are also shown on the
**Métricas** page.

## 1. Chatbot

**Protocol.** Two question sets in Spanish and English, each question labeled with its expected document
(or concept definition, category list, or "should decline"):

* **Development set** (45 questions + 6 two-turn conversations) — used to tune the engine.
* **Test set** (45 questions + 4 conversations) — written and committed to the repository *before* tuning
  (commit `20a1fd9`) and never used to adjust the system.

An answer is correct only if it is grounded in the expected document (or gives the expected definition,
list or refusal).

| | Development | **Test** |
| --- | --- | --- |
| Overall accuracy | 92.2% (47/51) | **85.7% (42/49)** |
| Document questions | 89.5% (38) | 86.8% (38) |
| Concept definitions | 100% (3) | 100% (3) |
| Category lists | 100% (1) | 100% (1) |
| Out-of-scope questions declined | 100% (3) | 33.3% (3) |
| Follow-up conversations | 100% (6) | 100% (4) |
| Spanish / English | 89.2% / 100% | 83.3% / 88.9% |

**Retrieval quality (test, 38 document questions):** precision@1 92.1%, recall@3 100%, recall@5 100%,
MRR 0.961. The expected document is always among the first three results.

**Errors on the test set (7):**
* 3 ranking errors between close documents (paint process vs. paint quality gate; line balancing vs. door
  station takt; monthly safety report vs. near-miss report).
* 2 correct documents rejected as "not enough evidence" ("no quedarnos sin chips", "falto al trabajo"): the
  question shares only one word with the document.
* 2 out-of-scope questions answered instead of declined ("Recomiéndame una película", "Who is the CEO of
  Toyota?"): one common word (*recomendar*, *Toyota*) was enough to pass the confidence check.

**Average response time of the engine:** < 1 ms per question; 124 ms end to end in the browser (local).

**Limitations.** The test questions were written by the same team that built the system, so they are not as
independent as questions from real users. A user test is recommended (see section 4).

## 2. Automated classification

4-fold StratifiedGroupKFold × 5 repeats over 144 samples (72 documents × 2 languages).

| Model | Accuracy | Macro F1 |
| --- | --- | --- |
| Phase 1 pipeline (English stop words, no stemming) + LR | 77.6% | 0.77 |
| Naive Bayes | 80.4% | 0.79 |
| Linear SVM | 82.6% | 0.82 |
| **Logistic Regression (chosen)** | **83.2%** | **0.83** |

Phase 1 reported 70.8% cross-validation accuracy on 48 English documents.

| Category | Precision | Recall | F1 |
| --- | --- | --- | --- |
| Manufacturing | 0.74 | 0.76 | 0.75 |
| Quality | 0.88 | 0.88 | 0.88 |
| Safety | 0.79 | 0.52 | 0.63 |
| R&D | 0.95 | 0.97 | 0.96 |
| Supply Chain | 0.81 | 0.92 | 0.86 |
| HR & Training | 0.81 | 0.95 | 0.88 |

Safety is the hardest category: several safety procedures talk about maintenance and the line and are
confused with Manufacturing (19%) or Training (15%).

## 3. Recommendations

**Related documents (content-based), precision@5:**

| Method | Same category | Same category or shared concept |
| --- | --- | --- |
| Random | 14.7% | 19.2% |
| Cosine only | 56.9% | 65.6% |
| **Cosine + ontology (used)** | **75.0%** | **90.8%** |

The "same category" column does not use the ontology, so it is a fair comparison. Every document appears in at
least one recommendation list (100% catalog coverage).

**History / search context ("Recomendado para ti"):** 120 simulated single-topic sessions (3 opened documents +
1 search): precision@5 = 83% same category, 96% same category or shared concept (random: 15%). In 120
topic-change sessions, 54% of the suggestions already come from the new topic after two documents.

## 4. Usability

* **Accessibility:** axe-core (WCAG 2.1 A/AA) on the 6 sections in desktop (1440 px) and mobile (390 px):
  **0 violations**, 23 rules passed per page on average, no horizontal scrolling on mobile.
* **Heuristic review (team self-assessment, Nielsen):** status visibility (typing indicator, similarity and
  sources on every answer), user language (Spanish/English, everyday synonyms), user control (clear history,
  Esc to close), error prevention (honest "no information" instead of invented answers), recognition over
  recall (suggested questions, detected concepts), help on request.
* **SUS questionnaire:** built into the Métricas page. Pending: apply it to 5 users after a 5-minute task
  (e.g. "find what to do if solvent spills") and report the average score (> 68 = above average).

## 5. Expected impact for Toyota

* **Information retrieval:** the right document is in the top 3 for every test question, and answers come with
  their source in under a second, instead of searching folders and email.
* **Knowledge reuse:** related-document suggestions and the graph connect a fix (e.g. a root-cause analysis) to
  similar problems in other areas, supporting *yokoten* between plants.
* **Internal training:** new operators can ask in plain language ("¿qué es el jidoka?") and get the definition
  plus the procedures where it applies.
* **Decision support:** supervisors find past countermeasures and standards quickly; the classifier keeps the
  repository organized as it grows.
