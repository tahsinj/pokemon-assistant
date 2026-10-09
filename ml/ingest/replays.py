"""Showdown replays for the team model: a polite crawler over the public
replay API, and the derived rows the model trains on.

Raw replays are cached under data/replays/raw/ so a crawl can resume and
never fetches a replay twice; they are never committed or shipped. Only the
derived rows (teams, ratings, winner, what each Pokemon revealed) feed
training.

Usage: uv run python -m ingest.replays --format gen9ou --count 20000 [--min-rating 1300]
"""

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "replays"
API = "https://replay.pokemonshowdown.com"
USER_AGENT = "stab-lab replay ingest (https://github.com/tahsinj/pokemon-assistant)"
# Seconds between requests; the replay server is a shared community service.
PAUSE = 1.0


def to_id(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def species_of(details: str) -> str:
    """Species id from protocol details ("Urshifu-*, L100, F" -> "urshifu")."""
    name = details.split(",")[0].strip()
    return to_id(name.removesuffix("-*"))


def derive(replay: dict) -> dict | None:
    """The row the team model trains on, or None for a game it can't use
    (no team preview, a forfeit before turn 2, no winner)."""
    lines = replay.get("log", "").split("\n")
    teams: dict[str, list[str]] = {"p1": [], "p2": []}
    names: dict[str, str] = {}
    ratings: dict[str, int | None] = {"p1": None, "p2": None}
    # Nicknames point at species once a Pokemon has switched in.
    nick: dict[str, str] = {}
    revealed: dict[str, dict] = {}
    winner_name = None
    turns = 0
    for line in lines:
        parts = line.split("|")
        if len(parts) < 2:
            continue
        kind = parts[1]
        if kind == "player" and len(parts) >= 4 and parts[2] in teams:
            names[parts[2]] = parts[3]
            if len(parts) >= 6 and parts[5].strip().isdigit():
                ratings[parts[2]] = int(parts[5])
        elif kind == "poke" and len(parts) >= 4 and parts[2] in teams:
            teams[parts[2]].append(species_of(parts[3]))
        elif kind in ("switch", "drag", "replace") and len(parts) >= 4:
            side, name = parts[2][:2], parts[2].split(": ", 1)[-1]
            sp = species_of(parts[3])
            # Team preview hides some formes; the switch shows the real one.
            nick[f"{side}:{name}"] = sp
        elif kind == "move" and len(parts) >= 4 and not any(p.startswith("[from]") for p in parts):
            key = _mon(parts[2], nick)
            if key:
                revealed.setdefault(key, _empty())["moves"].add(to_id(parts[3]))
        elif kind in ("-item", "-enditem") and len(parts) >= 4:
            key = _mon(parts[2], nick)
            # An item received by Trick and the like isn't its own.
            swapped = kind == "-item" and any(re.search(r"\[from\] move: (Trick|Switcheroo|Bestow|Thief|Covet)", p) for p in parts)
            if key and not swapped:
                revealed.setdefault(key, _empty()).setdefault("item", to_id(parts[3]))
        elif kind == "-ability" and len(parts) >= 4:
            key = _mon(parts[2], nick)
            if key:
                revealed.setdefault(key, _empty()).setdefault("ability", to_id(parts[3]))
        elif kind == "-terastallize" and len(parts) >= 4:
            key = _mon(parts[2], nick)
            if key:
                revealed.setdefault(key, _empty())["tera"] = to_id(parts[3])
        elif kind == "turn":
            turns = int(parts[2]) if parts[2].isdigit() else turns
        elif kind == "win" and len(parts) >= 3:
            winner_name = parts[2]
    if len(teams["p1"]) < 6 or len(teams["p2"]) < 6 or turns < 2 or not winner_name:
        return None
    winner = next((s for s, n in names.items() if n == winner_name), None)
    if not winner:
        return None
    month = time.strftime("%Y-%m", time.gmtime(replay.get("uploadtime", 0)))
    sets = {}
    for key, v in revealed.items():
        side, sp = key.split(":")
        # Key revealed sets by the team preview entry (preview shows "urshifu" for Urshifu-Rapid-Strike).
        entry = sp if sp in teams[side] else next((t for t in teams[side] if sp.startswith(t)), sp)
        sets[f"{side}:{entry}"] = {**v, "moves": sorted(v["moves"])}
    return {
        "id": replay.get("id"),
        "format": to_id(replay.get("formatid") or replay.get("format", "")),
        "month": month,
        "rating": replay.get("rating"),
        "p1_rating": ratings["p1"],
        "p2_rating": ratings["p2"],
        "p1": teams["p1"],
        "p2": teams["p2"],
        "winner": winner,
        "turns": turns,
        "revealed": sets,
    }


def _empty() -> dict:
    return {"moves": set()}


def _mon(ident: str, nick: dict[str, str]) -> str | None:
    """"p1a: Nick" -> "p1:species" once that Pokemon has switched in."""
    if ": " not in ident:
        return None
    side, name = ident[:2], ident.split(": ", 1)[1]
    sp = nick.get(f"{side}:{name}")
    return f"{side}:{sp}" if sp else None


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def crawl(fmt: str, count: int, min_rating: int, root: Path = ROOT) -> int:
    """Fetch up to `count` rated replays at or above `min_rating`, newest first. Returns how many are cached."""
    raw = root / "raw" / fmt
    raw.mkdir(parents=True, exist_ok=True)
    have = {p.stem for p in raw.glob("*.json")}
    before = None
    while len(have) < count:
        query = {"format": fmt}
        if before:
            query["before"] = str(before)
        page = json.loads(_get(f"{API}/search.json?{urllib.parse.urlencode(query)}"))
        time.sleep(PAUSE)
        if not page:
            break
        for entry in page:
            before = entry["uploadtime"]
            if entry.get("private") or (entry.get("rating") or 0) < min_rating or entry["id"] in have:
                continue
            try:
                (raw / f"{entry['id']}.json").write_bytes(_get(f"{API}/{entry['id']}.json"))
                have.add(entry["id"])
            except OSError as err:
                print(f"skipped {entry['id']}: {err}")
            time.sleep(PAUSE)
            if len(have) >= count:
                break
        print(f"{fmt}: {len(have)} replays cached, back to {time.strftime('%Y-%m-%d', time.gmtime(before))}", flush=True)
    return len(have)


def build(fmt: str, root: Path = ROOT) -> int:
    """Derive rows from every cached replay into data/replays/<format>.jsonl."""
    rows = []
    for path in sorted((root / "raw" / fmt).glob("*.json")):
        row = derive(json.loads(path.read_text()))
        if row:
            rows.append(row)
    (root / f"{fmt}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    return len(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", default="gen9ou")
    ap.add_argument("--count", type=int, default=20000)
    ap.add_argument("--min-rating", type=int, default=1300)
    ap.add_argument("--derive-only", action="store_true")
    args = ap.parse_args()
    if not args.derive_only:
        crawl(args.format, args.count, args.min_rating)
    print(f"{args.format}: {build(args.format)} usable games")


if __name__ == "__main__":
    main()
