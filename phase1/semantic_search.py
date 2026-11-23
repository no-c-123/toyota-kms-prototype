"""
Toyota Knowledge Management System - Basic Semantic Search
-----------------------------------------------------------
  1. Receive a natural-language query.
  2. Convert the query into a TF-IDF vector (same vocabulary as the documents).
  3. Compute cosine similarity between the query and every document.
  4. Show the most relevant documents, ranked by similarity.

Run:
  python semantic_search.py                      -> runs the demo queries
  python semantic_search.py "how to stop the line when there is a defect"
  python semantic_search.py -i                   -> interactive mode
"""

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DATA_FILE = Path(__file__).parent / "toyota_documents_v1.json"


class ToyotaSearchEngine:
    def __init__(self, path=DATA_FILE):
        with open(path, encoding="utf-8") as f:
            self.docs = json.load(f)
        corpus = [d["title"] + ". " + d["text"] for d in self.docs]
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2),
                                          sublinear_tf=True)
        # Document-term matrix: one row per document, one column per term
        self.doc_matrix = self.vectorizer.fit_transform(corpus)

    def search(self, query, top_k=3, min_score=0.01):
        query_vec = self.vectorizer.transform([query])                 # step 2
        scores = cosine_similarity(query_vec, self.doc_matrix)[0]      # step 3
        ranked = np.argsort(scores)[::-1][:top_k]                      # step 4
        return [(self.docs[i], float(scores[i])) for i in ranked if scores[i] >= min_score]

    def show(self, query, top_k=3):
        print(f'\nQUERY: "{query}"')
        terms = [t for t in self.vectorizer.build_analyzer()(query) if " " not in t
                 and t in self.vectorizer.vocabulary_]
        print(f"  Terms recognized: {', '.join(terms) if terms else '(none)'}")
        results = self.search(query, top_k)
        if not results:
            print("  No relevant documents found.")
            return
        for rank, (doc, score) in enumerate(results, 1):
            print(f"  {rank}. [{score:.3f}] {doc['id']} | {doc['category']:<13} | {doc['title']}")


DEMO_QUERIES = [
    "what to do when an operator finds a problem and needs to stop the line",
    "how are suppliers told to deliver more parts",
    "protection against electric shock with hybrid batteries",
    "keep the knowledge of senior technicians before they retire",
    "why do customers report brake noise",
]


def main():
    engine = ToyotaSearchEngine()
    print("=" * 78)
    print("TOYOTA KMS - SEMANTIC SEARCH (TF-IDF + cosine similarity)")
    print("=" * 78)
    print(f"Indexed documents: {engine.doc_matrix.shape[0]} | "
          f"Vocabulary size: {engine.doc_matrix.shape[1]} terms")

    args = sys.argv[1:]
    if args and args[0] == "-i":
        while True:
            q = input("\nSearch (Enter to exit): ").strip()
            if not q:
                break
            engine.show(q, top_k=5)
    elif args:
        engine.show(" ".join(args), top_k=5)
    else:
        for q in DEMO_QUERIES:
            engine.show(q)


if __name__ == "__main__":
    main()
