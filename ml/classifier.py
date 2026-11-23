"""
Component 1 - Automated document classification (refined from Phase 1).

What changed since Phase 1:
  * corpus grew from 48 English documents to 72 bilingual documents (12 per category);
  * every document is used twice (English and Spanish version) so the model classifies both languages;
  * text processing handles accents and word forms (prefix stemming) in both languages;
  * evaluation uses grouped cross-validation: the English and Spanish versions of a document
    always fall in the same fold, so the model is never tested on a translation it trained on.

Outputs:
  ml/output/classification_report.json   metrics used by the web Metrics page
  ml/output/confusion_matrix.png
  (the trained model is exported by build_artifacts.py through train_final_model())

Run:  python classifier.py
"""

import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, precision_recall_fscore_support)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from common import CATEGORIES, OUT, doc_text, load_documents, make_vectorizer

REPEATS = 5
FOLDS = 4


def samples(docs):
    X, y, groups, langs = [], [], [], []
    for d in docs:
        for lang in ("en", "es"):
            X.append(doc_text(d, lang)); y.append(d["category"]); groups.append(d["id"]); langs.append(lang)
    return X, np.array(y), np.array(groups), np.array(langs)


CANDIDATES = {
    "Phase 1 baseline (English words, no stemming) + Logistic Regression":
        lambda: Pipeline([("tfidf", TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)),
                          ("clf", LogisticRegression(C=10, max_iter=2000))]),
    "Naive Bayes":
        lambda: Pipeline([("tfidf", make_vectorizer()), ("clf", MultinomialNB(alpha=0.1))]),
    "Linear SVM":
        lambda: Pipeline([("tfidf", make_vectorizer()), ("clf", LinearSVC(C=1.0))]),
    "Logistic Regression (C=10)":
        lambda: Pipeline([("tfidf", make_vectorizer()), ("clf", LogisticRegression(C=10, max_iter=2000))]),
    "Logistic Regression (C=30)":
        lambda: Pipeline([("tfidf", make_vectorizer()), ("clf", LogisticRegression(C=30, max_iter=2000))]),
}


def cross_validate(make_model, X, y, groups):
    """Repeated grouped CV. Returns per-repeat metrics and pooled predictions of all repeats."""
    accs, macro = [], []
    pooled_true, pooled_pred = [], []
    X = np.array(X, dtype=object)
    for rep in range(REPEATS):
        cv = StratifiedGroupKFold(n_splits=FOLDS, shuffle=True, random_state=rep)
        pred = np.empty_like(y)
        for tr, te in cv.split(X, y, groups):
            model = make_model().fit(list(X[tr]), y[tr])
            pred[te] = model.predict(list(X[te]))
        accs.append(accuracy_score(y, pred))
        macro.append(precision_recall_fscore_support(y, pred, average="macro", zero_division=0)[:3])
        pooled_true += list(y); pooled_pred += list(pred)
    macro = np.array(macro)
    return {
        "accuracy_mean": float(np.mean(accs)), "accuracy_std": float(np.std(accs)),
        "precision_macro": float(macro[:, 0].mean()), "recall_macro": float(macro[:, 1].mean()),
        "f1_macro": float(macro[:, 2].mean()),
    }, pooled_true, pooled_pred


def train_final_model(docs):
    """Logistic Regression on all 144 samples, exported for the web API."""
    X, y, _, _ = samples(docs)
    vec = make_vectorizer()
    Xv = vec.fit_transform(X)
    clf = LogisticRegression(C=30, max_iter=5000).fit(Xv, y)
    return vec, clf


def main():
    docs = load_documents()
    X, y, groups, langs = samples(docs)
    print(f"Samples: {len(X)} ({len(docs)} documents x 2 languages), {FOLDS}-fold grouped CV x {REPEATS} repeats\n")

    results, best = {}, None
    for name, make in CANDIDATES.items():
        summary, t, p = cross_validate(make, X, y, groups)
        results[name] = summary
        print(f"{name:<70} acc {summary['accuracy_mean']:.1%} (+/-{summary['accuracy_std']:.1%})  "
              f"P {summary['precision_macro']:.2f}  R {summary['recall_macro']:.2f}  F1 {summary['f1_macro']:.2f}")
        if name.startswith("Logistic Regression (C=30)"):
            best = (name, t, p)

    name, t, p = best
    prec, rec, f1, sup = precision_recall_fscore_support(t, p, labels=CATEGORIES, zero_division=0)
    per_class = {c: {"precision": float(prec[i]), "recall": float(rec[i]), "f1": float(f1[i])}
                 for i, c in enumerate(CATEGORIES)}
    cm = confusion_matrix(t, p, labels=CATEGORIES)
    cm_norm = (cm / cm.sum(axis=1, keepdims=True)).round(3)

    # accuracy by language for the chosen model (one repeat is enough to show the split)
    lang_acc = {}
    Xa = np.array(X, dtype=object)
    cv = StratifiedGroupKFold(n_splits=FOLDS, shuffle=True, random_state=0)
    pred = np.empty_like(y)
    for tr, te in cv.split(Xa, y, groups):
        pred[te] = CANDIDATES[name]().fit(list(Xa[tr]), y[tr]).predict(list(Xa[te]))
    for lang in ("en", "es"):
        m = langs == lang
        lang_acc[lang] = float(accuracy_score(y[m], pred[m]))

    print(f"\nChosen model: {name}")
    for c in CATEGORIES:
        print(f"  {c:<15} P {per_class[c]['precision']:.2f}  R {per_class[c]['recall']:.2f}  F1 {per_class[c]['f1']:.2f}")
    print(f"  accuracy by language (repeat 0): EN {lang_acc['en']:.1%}  ES {lang_acc['es']:.1%}")

    report = {
        "protocol": f"{FOLDS}-fold StratifiedGroupKFold x {REPEATS} repeats; groups = document id "
                    f"(both language versions of a document stay in the same fold)",
        "n_documents": len(docs), "n_samples": len(X),
        "models": results, "chosen_model": name,
        "per_class": per_class, "labels": CATEGORIES,
        "confusion_matrix": cm.tolist(), "confusion_matrix_normalized": cm_norm.tolist(),
        "accuracy_by_language": lang_acc,
        "phase1_reference": {"holdout_accuracy": 0.75, "cv_accuracy": 0.708,
                             "note": "Phase 1: 48 English-only documents, 4-fold CV"},
    }
    (OUT / "classification_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    labels_es = ["Manufactura", "Calidad", "Seguridad", "I+D", "Suministro", "Capacitación"]
    fig, ax = plt.subplots(figsize=(7.5, 6.2))
    ax.imshow(cm_norm, cmap="Reds", vmin=0, vmax=1)
    ax.set_xticks(range(6), labels_es, rotation=35, ha="right"); ax.set_yticks(range(6), labels_es)
    for i in range(6):
        for j in range(6):
            ax.text(j, i, f"{cm_norm[i, j]:.0%}", ha="center", va="center",
                    color="white" if cm_norm[i, j] > 0.5 else "#222", fontsize=10)
    ax.set_xlabel("Predicción"); ax.set_ylabel("Categoría real")
    ax.set_title("Matriz de confusión · Regresión logística (validación cruzada)")
    fig.tight_layout(); fig.savefig(OUT / "confusion_matrix.png", dpi=150)
    print(f"\nSaved {OUT / 'classification_report.json'} and confusion_matrix.png")


if __name__ == "__main__":
    main()
