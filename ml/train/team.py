"""Train the team strength model for one format and export it.

The main model is a set transformer: each Pokemon is the sum of its token
embeddings, attention runs within each team and then across the two, and a
small head turns both teams plus both players' ratings into a logit. The
score is made antisymmetric, so P(A beats B) = 1 - P(B beats A). Ratings are
inputs during training and set equal at inference, so the model scores teams
rather than players. A logistic regression on species presence is the
baseline. The latest month is held out.

Usage: uv run --group train python -m train.team --format gen9ou
"""

import argparse
import json
from datetime import date
from pathlib import Path

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from torch import nn

from eval.metrics import brier, calibration, log_loss
from features.team import PAD, SLOTS, build_vocab, encode, species_bag

ROOT = Path(__file__).resolve().parent.parent
LABELS = {"gen9ou": "Gen 9 OU", "gen9nationaldex": "National Dex OU"}


class TeamModel(nn.Module):
    def __init__(self, vocab_size: int, dim: int = 64, heads: int = 4):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, dim, padding_idx=PAD)
        self.own = nn.MultiheadAttention(dim, heads, batch_first=True)
        self.cross = nn.MultiheadAttention(dim, heads, batch_first=True)
        self.norm1 = nn.LayerNorm(dim)
        self.norm2 = nn.LayerNorm(dim)
        self.head = nn.Sequential(nn.Linear(3 * dim + 2, dim), nn.ReLU(), nn.Linear(dim, 1))

    def mons(self, team: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """[N, 6, SLOTS] tokens -> [N, 6, dim] Pokemon vectors and a mask of empty slots."""
        return self.embed(team).sum(dim=2), team[:, :, 0] == PAD

    def encode_team(self, x: torch.Tensor, empty: torch.Tensor, other: torch.Tensor, other_empty: torch.Tensor) -> torch.Tensor:
        h = self.norm1(x + self.own(x, x, x, key_padding_mask=empty, need_weights=False)[0])
        h = self.norm2(h + self.cross(h, other, other, key_padding_mask=other_empty, need_weights=False)[0])
        keep = (~empty).unsqueeze(-1).float()
        return (h * keep).sum(1) / keep.sum(1).clamp(min=1)

    def score(self, a: torch.Tensor, b: torch.Tensor, ratings: torch.Tensor) -> torch.Tensor:
        xa, ea = self.mons(a)
        xb, eb = self.mons(b)
        ha = self.encode_team(xa, ea, xb, eb)
        hb = self.encode_team(xb, eb, xa, ea)
        return self.head(torch.cat([ha, hb, ha - hb, ratings], dim=1)).squeeze(1)

    def forward(self, a: torch.Tensor, b: torch.Tensor, ratings: torch.Tensor) -> torch.Tensor:
        """P(team A beats team B)."""
        flipped = ratings.flip(1)
        return torch.sigmoid((self.score(a, b, ratings) - self.score(b, a, flipped)) / 2)


def drop_reveals(t: torch.Tensor, rate: float) -> torch.Tensor:
    """Hide what Pokemon revealed (all but the species token) at random, so species-only teams score well too."""
    out = t.clone()
    hide = torch.rand(out.shape[0], out.shape[1], 1) < rate
    out[:, :, 1:] = torch.where(hide, torch.zeros_like(out[:, :, 1:]), out[:, :, 1:])
    return out


def species_only(t: np.ndarray) -> np.ndarray:
    out = t.copy()
    out[:, :, 1:] = PAD
    return out


def fit(model: TeamModel, a, b, r, y, va, vb, vr, vy, epochs: int = 40, seed: int = 7) -> int:
    torch.manual_seed(seed)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    a, b, r, y = map(torch.as_tensor, (a, b, r, y))
    best, best_state, best_epoch, patience = float("inf"), None, 0, 0
    for epoch in range(epochs):
        model.train()
        order = torch.randperm(len(y))
        for i in range(0, len(y), 256):
            idx = order[i:i + 256]
            # Each game is also seen from the other side.
            ab = torch.cat([drop_reveals(a[idx], 0.5), drop_reveals(b[idx], 0.5)])
            ba = torch.cat([ab[len(idx):], ab[:len(idx)]])
            rr = torch.cat([r[idx], r[idx].flip(1)])
            yy = torch.cat([y[idx], 1 - y[idx]])
            loss = nn.functional.binary_cross_entropy(model(ab, ba, rr).clamp(1e-6, 1 - 1e-6), yy)
            opt.zero_grad()
            loss.backward()
            opt.step()
        val = log_loss(predict(model, va, vb, vr), vy)
        if val < best - 1e-4:
            best, best_state, best_epoch, patience = val, {k: v.clone() for k, v in model.state_dict().items()}, epoch, 0
        else:
            patience += 1
            if patience >= 5:
                break
    model.load_state_dict(best_state)
    return best_epoch + 1


def predict(model: TeamModel, a, b, r) -> np.ndarray:
    model.eval()
    with torch.no_grad():
        return model(torch.as_tensor(a), torch.as_tensor(b), torch.as_tensor(r)).numpy()


def report(p: np.ndarray, y: np.ndarray) -> dict:
    return {"auc": float(roc_auc_score(y, p)), "log_loss": log_loss(p, y), "brier": brier(p, y), "calibration": calibration(p, y)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", default="gen9ou")
    ap.add_argument("--data", type=Path, default=ROOT / "data" / "replays")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "models")
    ap.add_argument("--cards", type=Path, default=ROOT.parent / "docs" / "models")
    ap.add_argument("--meta-teams", type=int, default=500)
    args = ap.parse_args()
    fmt = args.format

    rows = [json.loads(l) for l in (args.data / f"{fmt}.jsonl").read_text().splitlines() if l.strip()]
    months = sorted({r["month"] for r in rows})
    test_month = months[-1]
    train_rows = [r for r in rows if r["month"] != test_month]
    test_rows = [r for r in rows if r["month"] == test_month]
    rng = np.random.default_rng(7)
    rng.shuffle(train_rows)
    cut = int(len(train_rows) * 0.9)
    fit_rows, val_rows = train_rows[:cut], train_rows[cut:]

    vocab = build_vocab(fit_rows)
    a, b, r, y = encode(fit_rows, vocab)
    va, vb, vr, vy = encode(val_rows, vocab)
    ta, tb, tr, ty = encode(test_rows, vocab)
    zeros = np.zeros_like(tr)

    # Baseline: species presence, A minus B, plus the rating gap.
    species = {i: n for n, (tok, i) in enumerate(t for t in vocab.items() if t[0].startswith("s:"))}
    bag = lambda x, z: np.hstack([species_bag(x, species), z])  # noqa: E731
    lx = np.vstack([bag(a, r) - bag(b, r[:, ::-1]) , bag(b, r[:, ::-1]) - bag(a, r)])
    ly = np.concatenate([y, 1 - y])
    logistic = LogisticRegression(max_iter=3000, C=0.5).fit(lx, ly)
    lr_p = logistic.predict_proba(bag(ta, tr) - bag(tb, tr[:, ::-1]))[:, 1]

    model = TeamModel(len(vocab))
    epochs = fit(model, a, b, r, y, va, vb, vr, vy)
    metrics = {
        "format": fmt,
        "label": LABELS.get(fmt, fmt),
        "trained": date.today().isoformat(),
        "data": {"games": len(rows), "months": months, "test_month": test_month, "train_games": len(train_rows), "test_games": len(test_rows),
                 "vocab": len(vocab), "epochs": epochs},
        "transformer": report(predict(model, ta, tb, tr), ty),
        "transformer_equal_ratings": report(predict(model, ta, tb, zeros), ty),
        "transformer_species_only": report(predict(model, species_only(ta), species_only(tb), zeros), ty),
        "logistic": report(lr_p, ty),
    }

    out = args.out / fmt
    out.mkdir(parents=True, exist_ok=True)
    onnx_path = out / "team.onnx"
    torch.onnx.export(
        model, (torch.as_tensor(ta[:2]), torch.as_tensor(tb[:2]), torch.as_tensor(zeros[:2])), str(onnx_path),
        input_names=["team_a", "team_b", "ratings"], output_names=["win"],
        dynamic_axes={"team_a": {0: "n"}, "team_b": {0: "n"}, "ratings": {0: "n"}, "win": {0: "n"}}, opset_version=17,
        dynamo=False,
    )
    check_onnx(onnx_path, model, ta[:64], tb[:64], zeros[:64])
    (out / "team-vocab.json").write_text(json.dumps({"slots": SLOTS, "tokens": vocab}))
    (out / "team-metrics.json").write_text(json.dumps(metrics, indent=2))
    # The meta: recent high-rated teams, species and what they revealed, for the app's meta score.
    meta = sorted(test_rows, key=lambda x: -(x.get("rating") or 0))[: args.meta_teams]
    teams = [{"species": m[s], "revealed": {k.split(":", 1)[1]: v for k, v in m["revealed"].items() if k.startswith(s)}} for m in meta for s in ("p1", "p2")]
    (out / "meta-teams.json").write_text(json.dumps({"month": test_month, "teams": teams[: args.meta_teams]}))
    card = team_card(fmt, metrics)
    (out / "TEAM_MODEL_CARD.md").write_text(card)
    args.cards.mkdir(parents=True, exist_ok=True)
    (args.cards / f"team-{fmt}.md").write_text(card)
    t, s, lr = metrics["transformer_equal_ratings"], metrics["transformer_species_only"], metrics["logistic"]
    print(f"{fmt}: transformer AUC {t['auc']:.3f} (species only {s['auc']:.3f}), logistic {lr['auc']:.3f} on {test_month}")


def check_onnx(path: Path, model: TeamModel, a, b, r) -> None:
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.log_severity_level = 3
    got = ort.InferenceSession(str(path), options).run(None, {"team_a": a, "team_b": b, "ratings": r})[0]
    gap = float(np.abs(got - predict(model, a, b, r)).max())
    if gap > 1e-4:
        raise RuntimeError(f"ONNX output differs from PyTorch by {gap}")


def team_card(fmt: str, m: dict) -> str:
    d = m["data"]

    def row(name: str, r: dict) -> str:
        return f"| {name} | {r['auc']:.3f} | {r['log_loss']:.4f} | {r['brier']:.4f} |"

    cal = "\n".join(f"| {c['from']:.1f} to {c['to']:.1f} | {c['n']} | {c['predicted']:.3f} | {c['actual']:.3f} |"
                    for c in m["transformer_equal_ratings"]["calibration"])
    return f"""# Team model: {m['label']}

Predicts how likely team A is to beat team B in {m['label']} (`{fmt}`), from
each team's species and whatever their sets revealed. Trained {m['trained']}
by `ml/train/team.py`.

## Data

- Source: public replays from Showdown's replay server
  (replay.pokemonshowdown.com), fetched through its JSON API one request a
  second (`ml/ingest/replays.py`). Rated games of 1300 and up, {d['games']} usable
  games across {', '.join(d['months'])}. Raw logs stay in a local cache; only
  derived data (teams, ratings, winner, revealed sets) is used, and only the
  trained weights and a list of meta teams ship.
- Split by time: {d['train_games']} games before {d['test_month']} to train (a tenth of them to
  stop training), {d['test_games']} games from {d['test_month']} held out.

## Metrics ({d['test_month']}, held out)

Player ratings are inputs during training and set equal for scoring teams,
so the numbers that matter for the app are the middle two rows; "species
only" hides every revealed set, as when scoring a box team against the meta.

| Model | AUC | Log loss | Brier |
| --- | --- | --- | --- |
{row('Set transformer, real ratings', m['transformer'])}
{row('Set transformer, equal ratings', m['transformer_equal_ratings'])}
{row('Set transformer, species only', m['transformer_species_only'])}
{row('Logistic regression on species', m['logistic'])}

For reference, FutureSightML reports a pre-game AUC of 0.726 on Gen 9 OU.

Calibration (set transformer, equal ratings):

| Predicted | Games | Mean predicted | Win rate |
| --- | --- | --- | --- |
{cal}

## Known limits

- Ladder games at 1300 and up only; low-usage species have few examples, so
  their tokens are weak or unknown.
- Revealed sets are partial: unrevealed moves and items are simply absent.
- Who pilots the team still matters more than the team; AUC well below 1 is
  expected.
"""


if __name__ == "__main__":
    main()
