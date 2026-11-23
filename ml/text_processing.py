"""
Shared text processing for the Toyota KMS.

The SAME rules are implemented in JavaScript (web/lib/engine/text.js) so the
serverless API vectorizes queries exactly like the Python pipeline vectorized
the documents. `ml/check_parity.py` verifies both implementations agree.

Pipeline for any text (English or Spanish):
  1. lowercase + strip accents        "Inspección" -> "inspeccion"
  2. keep letters and digits only      "poka-yoke"  -> "poka yoke"
  3. drop stop words (EN + ES)         "the", "de", "para", ...
  4. light stemming (prefix of 5)      "suppliers" / "supplier" -> "suppl"
  5. unigrams + bigrams                "andon cord" -> "andon", "cord", "andon_cord"
"""

import re
import unicodedata

STEM_LEN = 5

STOP_WORDS = sorted(set("""
a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have
having he her here hers him his how i if in into is it its itself just me more most my no nor not now
of off on once only or other our ours out over own same she should so some such than that the their
them then there these they this those through to too under until up very was we were what when where
which while who whom why will with would you your yours must may might shall per via within without
every get got use used using new make makes made one two three four five also
el la los las un una unos unas lo al del de y o u e ni que en a ante bajo con contra desde durante
entre hacia hasta mediante para por segun sin sobre tras es son ser fue fueron era eran sido estar
esta estan este esto estos estas ese esa esos esas aquel aquella aquellos aquellas hay ha han he hemos
habia tiene tienen tener se su sus mi mis tu tus nuestro nuestra nuestros nuestras le les me te nos
como cuando donde cual cuales quien quienes cuanto cuanta cuantos cuantas que porque pero mas muy ya
tambien si no solo cada todo toda todos todas otro otra otros otras mismo misma puede pueden debe deben
hace hacen hacer haga sea esten estoy soy eres dice dicen algo alguno alguna algunos algunas
favor quiero quisiera necesito busco dame dime muestrame explicame hablame please tell show give want
need know find looking
""".split()))
STOP_SET = frozenset(STOP_WORDS)

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return _NON_ALNUM.sub(" ", text).strip()


def stem(token: str) -> str:
    """Prefix stemming: works the same for English and Spanish and is trivial to port."""
    if token.isdigit():
        return token
    return token[:STEM_LEN]


def tokens(text: str):
    return [stem(t) for t in normalize(text).split() if len(t) > 1 and t not in STOP_SET]


def analyzer(text: str):
    """Features used by the TF-IDF vectorizer: stemmed unigrams + bigrams."""
    toks = tokens(text)
    return toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]


def contains_phrase(normalized_text: str, phrase: str) -> bool:
    """Whole-word phrase match on normalized text (used for ontology keywords)."""
    p = normalize(phrase)
    return bool(p) and f" {p} " in f" {normalized_text} "
