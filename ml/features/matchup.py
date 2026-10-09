"""Model inputs from the TypeScript features. Nothing here recomputes game
mechanics; mirroring only relabels which side is A."""

import numpy as np
import polars as pl


def mirror_expr(names: list[str]) -> list[pl.Expr]:
    """Expressions that turn A-vs-B features into B-vs-A."""
    out = []
    for n in names:
        if n == "a_faster":
            out.append((1 - pl.col(n)).alias(n))
        elif n.startswith("a_"):
            out.append(pl.col("b_" + n[2:]).alias(n))
        elif n.startswith("b_"):
            out.append(pl.col("a_" + n[2:]).alias(n))
        elif n == "speed_ratio":
            out.append((1 / pl.col(n)).alias(n))
        elif n == "hits_diff":
            out.append((-pl.col(n)).alias(n))
        else:
            raise ValueError(f"no mirror rule for feature {n}")
    return out


def with_mirror(df: pl.DataFrame, names: list[str]) -> pl.DataFrame:
    """Every pair twice, once from each side, so the model is symmetric."""
    flipped = df.with_columns(*mirror_expr(names), (1 - pl.col("win")).alias("win"))
    return pl.concat([df, flipped.select(df.columns)])


def group_key(df: pl.DataFrame) -> pl.Series:
    """The unordered species pair, so a split never puts one pairing on both sides."""
    a, b = df["a_species"], df["b_species"]
    return pl.Series([" | ".join(sorted(p)) for p in zip(a, b)])


def weighted_rows(x: np.ndarray, win: np.ndarray, games: np.ndarray):
    """Soft labels as two weighted rows each (a win row and a loss row), for classifiers."""
    xx = np.vstack([x, x])
    y = np.concatenate([np.ones(len(x)), np.zeros(len(x))])
    w = np.concatenate([win * games, (1 - win) * games])
    keep = w > 0
    return xx[keep], y[keep], w[keep]
