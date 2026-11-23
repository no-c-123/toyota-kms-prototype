"""
Component 2a - Content-based recommendations ("documentos relacionados").

For every document we precompute the most related documents with a hybrid score:

    score(a, b) = 0.8 * cosine(tfidf(a), tfidf(b)) + 0.2 * jaccard(concepts(a), concepts(b))

* cosine similarity captures shared vocabulary in English and Spanish;
* the Jaccard term uses the ontology: documents that describe the same TPS concepts
  (andon, kanban, root cause...) are related even when they use different words.

The second half of the recommender (history / search-context recommendations) runs at
request time in the API, see web/lib/engine/recommend.js.

Run:  python recommender.py   -> prints an offline evaluation and writes ml/output/recommender_report.json
"""

import json
import random

import numpy as np

from common import OUT, doc_text, load_concepts, load_documents, make_vectorizer
from text_processing import contains_phrase, normalize

W_COS, W_CONCEPT = 0.8, 0.2
TOP_K = 5


def link_concepts(docs, concepts):
    """Document -> set of concept/principle ids whose keywords appear in its text (either language)."""
    items = concepts["concepts"] + concepts["principles"]
    links = {}
    for d in docs:
        norm = normalize(doc_text(d))
        links[d["id"]] = sorted({c["id"] for c in items if any(contains_phrase(norm, k) for k in c["keywords"])})
    return links


def jaccard(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


def similarity_matrices(docs, links):
    vec = make_vectorizer()
    M = vec.fit_transform([doc_text(d) for d in docs])
    cos = (M @ M.T).toarray()
    ids = [d["id"] for d in docs]
    jac = np.array([[jaccard(links[a], links[b]) for b in ids] for a in ids])
    return cos, jac


def content_recommendations(docs, links, top_k=TOP_K):
    cos, jac = similarity_matrices(docs, links)
    hybrid = W_COS * cos + W_CONCEPT * jac
    recs = {}
    for i, d in enumerate(docs):
        order = [j for j in np.argsort(-hybrid[i]) if j != i][:top_k]
        recs[d["id"]] = [{
            "id": docs[j]["id"],
            "score": round(float(hybrid[i, j]), 4),
            "cosine": round(float(cos[i, j]), 4),
            "shared_concepts": sorted(set(links[d["id"]]) & set(links[docs[j]["id"]])),
            "same_category": docs[j]["category"] == d["category"],
        } for j in order]
    return recs, cos, jac


def evaluate(docs, links, cos, jac):
    """Offline quality check. A recommendation counts as relevant when it shares the category
    or at least one ontology concept with the source document. Because the hybrid score itself
    uses concepts, we also report the stricter same-category precision, which does not."""
    ids = [d["id"] for d in docs]
    cat = {d["id"]: d["category"] for d in docs}

    def relevant(a, b):
        return cat[a] == cat[b] or bool(set(links[a]) & set(links[b]))

    def same_category(a, b):
        return cat[a] == cat[b]

    def precision_at(score_matrix, k, rel=relevant):
        ps = []
        for i, a in enumerate(ids):
            order = [j for j in np.argsort(-score_matrix[i]) if j != i][:k]
            ps.append(np.mean([rel(a, ids[j]) for j in order]))
        return float(np.mean(ps))

    rng = random.Random(0)
    rand = np.array([[rng.random() for _ in ids] for _ in ids])
    hybrid = W_COS * cos + W_CONCEPT * jac
    out = {}
    for name, m in [("random baseline", rand), ("cosine only", cos), ("hybrid (cosine + ontology)", hybrid)]:
        out[name] = {f"precision@{k}": round(precision_at(m, k), 3) for k in (3, 5)}
        # stricter, non-circular check: only the human-assigned category counts as relevance
        out[name]["precision@5_same_category"] = round(precision_at(m, 5, same_category), 3)
    # diversity: how many different categories show up in the top 5 on average
    out["avg_categories_in_top5"] = round(float(np.mean([
        len({cat[ids[j]] for j in [j for j in np.argsort(-hybrid[i]) if j != i][:5]}) for i in range(len(ids))
    ])), 2)
    out["catalog_coverage"] = round(len({ids[j] for i in range(len(ids))
                                         for j in [j for j in np.argsort(-hybrid[i]) if j != i][:5]}) / len(ids), 3)
    return out


def main():
    docs, concepts = load_documents(), load_concepts()
    links = link_concepts(docs, concepts)
    recs, cos, jac = content_recommendations(docs, links)
    report = evaluate(docs, links, cos, jac)
    print("Content-based recommendation quality (relevant = same category or shared concept):")
    for k, v in report.items():
        print(f"  {k:<28} {v}")
    print("\nExample - related to MFG-005 (andon response):")
    for r in recs["MFG-005"]:
        print(f"  {r['id']:<8} score {r['score']:.3f}  concepts {r['shared_concepts']}")
    (OUT / "recommender_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
