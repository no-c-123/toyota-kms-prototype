"""
Checks that the Python pipeline and the JavaScript API process text identically.
Runs the same sentences through ml/text_processing.py and web/lib/engine/text.js and compares
the features and TF-IDF vectors. Requires Node.js.

Run:  python check_parity.py
"""

import json
import subprocess

import numpy as np

from common import ROOT, doc_text, load_documents, make_vectorizer
import text_processing as tp

SAMPLES = [
    "¿Qué hago si el operador jala el cordón andon?",
    "What should the team leader do when the line stops?",
    "Inspección de calidad: piel de naranja y 5 porqués en cofres",
    "Poka-yoke & error-proofing devices (Cpk > 1.33) for 1,000 hours",
    "Niño, pingüino, acción, ÁRBOL — Über straße",
    "lockout/tagout   LOTO   zero-energy",
]


def main():
    docs = load_documents()
    vec = make_vectorizer().fit([doc_text(d) for d in docs])
    texts = SAMPLES + [doc_text(d, "es") for d in docs[:10]] + [doc_text(d, "en") for d in docs[-10:]]
    py_feats = [tp.analyzer(t) for t in texts]
    py_vecs = vec.transform(texts)

    script = f"""
import {{ analyzer, vectorize }} from './lib/engine/text.js';
import kb from './lib/data/kb.js';
const texts = {json.dumps(texts, ensure_ascii=False)};
console.log(JSON.stringify(texts.map(t => ({{ feats: analyzer(t), vec: [...vectorize(t, kb.index)] }}))));
"""
    out = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT / "web",
                         capture_output=True, text=True, check=True).stdout
    js = json.loads(out)
    feat_ok = all(p == j["feats"] for p, j in zip(py_feats, js))
    max_diff = 0.0
    for i, j in enumerate(js):
        row = py_vecs.getrow(i)
        py = dict(zip(row.indices.tolist(), row.data.tolist()))
        jsv = {int(k): v for k, v in j["vec"]}
        keys = set(py) | set(jsv)
        if keys:
            max_diff = max(max_diff, max(abs(py.get(k, 0) - jsv.get(k, 0)) for k in keys))
    print(f"Texts compared: {len(texts)}")
    print(f"Identical features: {feat_ok}")
    print(f"Max TF-IDF weight difference: {max_diff:.2e} (idf exported with 6 decimals)")
    if not feat_ok or max_diff > 1e-4:
        raise SystemExit("PARITY CHECK FAILED")
    print("PARITY OK")


if __name__ == "__main__":
    main()
