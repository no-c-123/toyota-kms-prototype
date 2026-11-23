"""
Builds everything the deployed system needs, from the raw data in /data.

  web/lib/data/kb.js            knowledge base for the serverless API (ES module):
                                documents, concepts, TF-IDF search index, trained classifier,
                                precomputed content recommendations, text-processing settings
  web/src/data/documents.json   document catalogue for the React frontend
  web/src/data/concepts.json    glossary for the React frontend

Run after changing any file in /data:   python build_artifacts.py
(then `npm run evaluate` in /web refreshes the metrics)
"""

import math
import re
from datetime import datetime, timezone

from classifier import train_final_model
from common import (CATEGORIES, CATEGORY_ES, WEB_LIB_DATA, WEB_SRC_DATA, doc_text, export_vectorizer,
                    load_concepts, load_documents, make_vectorizer, sparse_rows, write_js_module, write_json)
from recommender import content_recommendations, link_concepts
import text_processing as tp

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9])")


def sentences(text):
    return [s.strip() for s in SENTENCE_SPLIT.split(text) if s.strip()]


def main():
    docs, concepts = load_documents(), load_concepts()
    links = link_concepts(docs, concepts)

    # 1. search index (both languages in one vector per document)
    vec = make_vectorizer()
    M = vec.fit_transform([doc_text(d) for d in docs])
    index = export_vectorizer(vec)
    index["doc_vectors"] = sparse_rows(M)

    # 2. concept specificity: rare concepts are stronger evidence than common ones
    n = len(docs)
    df = {}
    for ids in links.values():
        for cid in ids:
            df[cid] = df.get(cid, 0) + 1
    concept_list = []
    for kind, items in (("principle", concepts["principles"]), ("concept", concepts["concepts"])):
        for c in items:
            concept_list.append({
                "id": c["id"], "kind": kind, "name_en": c["name_en"], "name_es": c["name_es"],
                "definition_en": c["definition_en"], "definition_es": c["definition_es"],
                "parent": c.get("parent") if kind == "principle" else c.get("principle"),
                "keywords": sorted({tp.normalize(k) for k in c["keywords"]}),
                # stemmed form, used to spot concepts in user questions despite word-form changes
                "keyword_stems": sorted({" ".join(tp.tokens(k)) for k in c["keywords"] if tp.tokens(k)}),
                "doc_count": df.get(c["id"], 0),
                "weight": round(math.log((n + 1) / (df.get(c["id"], 0) + 1)) + 1, 4),
            })

    # 3. classifier trained on all 144 samples (72 documents x 2 languages)
    cvec, clf = train_final_model(docs)
    classifier = export_vectorizer(cvec)
    classifier.update({
        "classes": [str(c) for c in clf.classes_],
        "coef": [[round(float(w), 4) for w in row] for row in clf.coef_],
        "intercept": [round(float(b), 4) for b in clf.intercept_],
    })

    # readable word for each stem, to explain predictions ("inspe" -> "inspeccion")
    from collections import Counter, defaultdict
    surface = defaultdict(Counter)
    for d in docs:
        for w in tp.normalize(doc_text(d)).split():
            if len(w) > 1 and w not in tp.STOP_SET:
                surface[tp.stem(w)][w] += 1
    classifier["stem_words"] = {st: c.most_common(1)[0][0] for st, c in surface.items()}

    # 4. content-based recommendations
    recs, _, _ = content_recommendations(docs, links)

    kb_docs = [{
        **{k: d[k] for k in ("id", "category", "type", "department", "title_en", "title_es", "text_en", "text_es")},
        "sentences_en": sentences(d["text_en"]), "sentences_es": sentences(d["text_es"]),
        "concepts": links[d["id"]],
    } for d in docs]

    kb = {
        "meta": {"built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "n_documents": len(docs), "stem_len": tp.STEM_LEN, "stop_words": tp.STOP_WORDS,
                 "categories": CATEGORIES, "categories_es": CATEGORY_ES},
        "documents": kb_docs, "concepts": concept_list, "index": index,
        "classifier": classifier, "recommendations": recs,
    }
    write_js_module(WEB_LIB_DATA / "kb.js", kb)
    write_json(WEB_SRC_DATA / "documents.json",
               [{k: v for k, v in d.items() if not k.startswith("sentences")} for d in kb_docs])
    write_json(WEB_SRC_DATA / "concepts.json",
               [{k: v for k, v in c.items() if k != "keywords"} for c in concept_list])

    size_kb = (WEB_LIB_DATA / "kb.js").stat().st_size / 1024
    print(f"kb.js written ({size_kb:.0f} KB): {len(docs)} documents, {len(concept_list)} concepts, "
          f"search vocabulary {len(index['vocab'])} terms, classifier vocabulary {len(classifier['vocab'])} terms")


if __name__ == "__main__":
    main()
