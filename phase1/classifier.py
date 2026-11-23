"""
Toyota Knowledge Management System - Automated Document Classifier
-------------------------------------------------------------------
Prototype for the course "Sistemas y tecnologias de administracion del conocimiento".

Steps:
  1. Load a set of sample Toyota documents (data/toyota_documents.json).
  2. Vectorize the text with TF-IDF.
  3. Train two simple models: Multinomial Naive Bayes and Logistic Regression.
  4. Evaluate them and classify new, unseen documents into the predefined categories.

Run:  python classifier.py
"""

import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.base import clone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (ConfusionMatrixDisplay, accuracy_score,
                             classification_report)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

BASE = Path(__file__).parent
DATA_FILE = BASE / "data" / "toyota_documents.json"
OUT_DIR = BASE / "output"
OUT_DIR.mkdir(exist_ok=True)

CATEGORIES = ["Manufacturing", "Quality", "Safety", "R&D", "Supply Chain", "HR & Training"]


# ---------------------------------------------------------------- 1. Load documents
def load_documents(path=DATA_FILE):
    with open(path, encoding="utf-8") as f:
        docs = json.load(f)
    # Title + body give the model more signal than the body alone
    texts = [d["title"] + ". " + d["text"] for d in docs]
    labels = [d["category"] for d in docs]
    return docs, texts, labels


# ---------------------------------------------------------------- 2 + 3. TF-IDF + model
def build_pipeline(model):
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            lowercase=True,
            stop_words="english",   # drop words like "the", "and", "of"
            ngram_range=(1, 2),     # single words and two-word phrases ("andon cord")
            sublinear_tf=True,      # dampen very frequent terms
        )),
        ("clf", clone(model)),   # fresh copy so models are never shared
    ])


MODELS = {
    "Naive Bayes": MultinomialNB(alpha=0.1),
    "Logistic Regression": LogisticRegression(C=10, max_iter=1000),
}


def main():
    docs, texts, labels = load_documents()
    print("=" * 70)
    print("TOYOTA KMS - AUTOMATED DOCUMENT CLASSIFIER")
    print("=" * 70)
    print(f"Documents loaded: {len(docs)}")
    for cat in CATEGORIES:
        print(f"  {cat:<15} {labels.count(cat)} documents")

    # Hold out 25% of the documents to test on text the model never saw
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.25, stratify=labels, random_state=42)
    print(f"\nTrain set: {len(X_train)} docs | Test set: {len(X_test)} docs")

    cv = StratifiedKFold(n_splits=4, shuffle=True, random_state=42)
    results = {}
    for name, model in MODELS.items():
        pipe = build_pipeline(model)
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        acc = accuracy_score(y_test, pred)
        cv_scores = cross_val_score(build_pipeline(model), texts, labels, cv=cv)
        results[name] = (pipe, acc, cv_scores.mean())
        print("\n" + "-" * 70)
        print(f"MODEL: {name}")
        print("-" * 70)
        print(f"Hold-out accuracy:        {acc:.2%}")
        print(f"4-fold cross-validation:  {cv_scores.mean():.2%} (+/- {cv_scores.std():.2%})")
        print(classification_report(y_test, pred, zero_division=0))

    # Pick the model with the best cross-validation score (hold-out accuracy breaks ties)
    # and retrain it on all documents
    best_name = max(results, key=lambda n: (results[n][2], results[n][1]))
    print("=" * 70)
    print(f"Best model by cross-validation: {best_name}")
    final = build_pipeline(MODELS[best_name]).fit(texts, labels)
    joblib.dump(final, OUT_DIR / "toyota_classifier.joblib")

    # Confusion matrix of the best model on the hold-out set (evidence image)
    best_pipe = results[best_name][0]
    fig, ax = plt.subplots(figsize=(7.5, 6.5))
    ConfusionMatrixDisplay.from_predictions(
        y_test, best_pipe.predict(X_test), labels=CATEGORIES,
        cmap="Reds", ax=ax, colorbar=False)
    ax.set_title(f"Confusion matrix - {best_name} (hold-out set)")
    plt.setp(ax.get_xticklabels(), rotation=35, ha="right")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "confusion_matrix.png", dpi=150)

    # Most informative terms per category (what the model "learned")
    vec = final.named_steps["tfidf"]
    clf = final.named_steps["clf"]
    terms = vec.get_feature_names_out()
    weights = clf.coef_ if hasattr(clf, "coef_") else clf.feature_log_prob_
    print("\nTop terms learned per category:")
    for i, cat in enumerate(clf.classes_):
        top = weights[i].argsort()[::-1][:6]
        print(f"  {cat:<15} " + ", ".join(terms[j] for j in top))

    # ------------------------------------------------------------ 4. Classify new documents
    new_docs = [
        "Root cause analysis of scratches found on bumpers during final inspection; corrective action and containment of defective parts.",
        "Procedure to evacuate the paint shop in case of fire and use of fire extinguishers by floor wardens.",
        "Engineers tested a new electric motor cooling design on the dynamometer to improve efficiency of the prototype.",
        "The supplier will deliver wire harnesses twice per day following the kanban signal to reduce inventory at the plant.",
        "Training course for new hires on standardized work, Toyota Way values and coaching by the team leader.",
        "Reduce takt time losses on the engine assembly line by rebalancing work between stations.",
    ]
    print("\n" + "=" * 70)
    print("CLASSIFYING NEW (UNSEEN) DOCUMENTS")
    print("=" * 70)
    probs = final.predict_proba(new_docs)
    for text, p in zip(new_docs, probs):
        order = p.argsort()[::-1]
        cat, conf = final.classes_[order[0]], p[order[0]]
        print(f"\n> {text[:90]}...")
        print(f"  Predicted category: {cat}  (confidence {conf:.0%};"
              f" 2nd: {final.classes_[order[1]]} {p[order[1]]:.0%})")


if __name__ == "__main__":
    main()
