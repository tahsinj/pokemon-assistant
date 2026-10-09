"""Reads simgen output (tools/simgen) into polars frames."""

import json
from pathlib import Path

import polars as pl

DATA = Path(__file__).resolve().parent.parent / "data" / "sim"


def feature_names(fmt: str, data: Path = DATA) -> list[str]:
    return json.loads((data / f"{fmt}.features.json").read_text())


def _frame(path: Path, names: list[str]) -> pl.DataFrame:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if not rows:
        raise ValueError(f"{path} has no rows")
    features = pl.DataFrame([r.pop("features") for r in rows], schema=names, orient="row")
    return pl.concat([pl.DataFrame(rows), features], how="horizontal")


def pairs(fmt: str, data: Path = DATA) -> pl.DataFrame:
    """One row per simulated pair: sets, outcome columns and one column per feature."""
    return _frame(data / f"{fmt}.jsonl", feature_names(fmt, data))


def checks(fmt: str, data: Path = DATA) -> pl.DataFrame:
    """Smogon's checks and counters with the features of check (A) against target (B)."""
    return _frame(data / f"{fmt}.checks.jsonl", feature_names(fmt, data))
