"""Team model inputs: per Pokemon, a species token plus tokens for what it
revealed (item, ability, Tera type, up to four moves), as vocabulary
indices. The app builds the same tokens from ids, which is plain text
handling, not game mechanics."""

from collections import Counter

import numpy as np

SLOTS = 8  # species, item, ability, tera, four moves
PAD, UNK = 0, 1


def mon_tokens(species: str, revealed: dict | None) -> list[str]:
    r = revealed or {}
    out = [f"s:{species}"]
    if r.get("item"):
        out.append(f"i:{r['item']}")
    if r.get("ability"):
        out.append(f"a:{r['ability']}")
    if r.get("tera"):
        out.append(f"t:{r['tera']}")
    out += [f"m:{m}" for m in r.get("moves", [])[:4]]
    return out


def build_vocab(rows: list[dict], min_count: int = 3) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for row in rows:
        for side in ("p1", "p2"):
            for sp in row[side]:
                counts.update(mon_tokens(sp, row["revealed"].get(f"{side}:{sp}")))
    vocab = {"<pad>": PAD, "<unk>": UNK}
    for tok, n in counts.most_common():
        if n >= min_count:
            vocab[tok] = len(vocab)
    return vocab


def encode_team(team: list[str], revealed: dict, side: str, vocab: dict[str, int]) -> np.ndarray:
    out = np.zeros((6, SLOTS), dtype=np.int64)
    for i, sp in enumerate(team[:6]):
        toks = mon_tokens(sp, revealed.get(f"{side}:{sp}"))
        for j, tok in enumerate(toks[:SLOTS]):
            # An unknown species still counts as a Pokemon; unknown extras are dropped.
            out[i, j] = vocab.get(tok, UNK if j == 0 else PAD)
    return out


def encode(rows: list[dict], vocab: dict[str, int]):
    """Team tokens for each side, both ratings (centred, scaled), and whether p1 won."""
    a = np.stack([encode_team(r["p1"], r["revealed"], "p1", vocab) for r in rows])
    b = np.stack([encode_team(r["p2"], r["revealed"], "p2", vocab) for r in rows])
    rating = lambda r, s: ((r.get(f"{s}_rating") or r.get("rating") or 1500) - 1500) / 400  # noqa: E731
    ratings = np.array([[rating(r, "p1"), rating(r, "p2")] for r in rows], dtype=np.float32)
    y = np.array([1.0 if r["winner"] == "p1" else 0.0 for r in rows], dtype=np.float32)
    return a, b, ratings, y


def species_bag(tokens: np.ndarray, species_index: dict[int, int]) -> np.ndarray:
    """Species presence per team as a dense vector, for the logistic baseline."""
    out = np.zeros((len(tokens), len(species_index)), dtype=np.float32)
    for n, team in enumerate(tokens):
        for tok in team[:, 0]:
            col = species_index.get(int(tok))
            if col is not None:
                out[n, col] = 1
    return out
