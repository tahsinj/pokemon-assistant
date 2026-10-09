from ingest.replays import derive, species_of

LOG = "\n".join([
    "|player|p1|Ash|red|1510",
    "|player|p2|Gary|blue|1490",
    "|poke|p1|Urshifu-*, M|",
    *[f"|poke|p1|{s}|" for s in ["Garchomp, F", "Corviknight, M", "Clefable, F", "Heatran, M", "Rotom-Wash"]],
    *[f"|poke|p2|{s}|" for s in ["Kingambit, M", "Great Tusk", "Gholdengo", "Dragapult, F", "Toxapex, F", "Iron Valiant"]],
    "|start",
    "|switch|p1a: Fists|Urshifu-Rapid-Strike, M|100/100",
    "|switch|p2a: Kingambit|Kingambit, M|100/100",
    "|turn|1",
    "|move|p1a: Fists|Surging Strikes|p2a: Kingambit",
    "|-damage|p2a: Kingambit|40/100",
    "|move|p2a: Kingambit|Sucker Punch|p1a: Fists",
    "|-enditem|p1a: Fists|Choice Scarf|[from] move: Knock Off",
    "|-terastallize|p2a: Kingambit|Dark",
    "|turn|2",
    "|move|p1a: Fists|U-turn|p2a: Kingambit|[from]move: Copycat",
    "|turn|3",
    "|player|p2|",
    "|win|Ash",
])


def test_species_from_details():
    assert species_of("Urshifu-*, L100, F") == "urshifu"
    assert species_of("Rotom-Wash") == "rotomwash"


def test_derive_keeps_teams_ratings_winner_and_reveals():
    row = derive({"id": "gen9ou-1", "formatid": "gen9ou", "uploadtime": 1791583278, "rating": 1500, "log": LOG})
    assert row["p1"][0] == "urshifu" and len(row["p1"]) == 6 and len(row["p2"]) == 6
    assert (row["p1_rating"], row["p2_rating"]) == (1510, 1490)
    assert row["winner"] == "p1"
    assert row["month"] == "2026-10"
    # Moves called by another move don't count; the forme maps back to the preview entry.
    assert row["revealed"]["p1:urshifu"]["moves"] == ["surgingstrikes"]
    assert row["revealed"]["p2:kingambit"]["tera"] == "dark"
    assert row["revealed"]["p1:urshifu"]["item"] == "choicescarf"


def test_unusable_games_are_dropped():
    assert derive({"log": "|player|p1|A||\n|player|p2|B||\n|turn|1\n|win|A"}) is None
