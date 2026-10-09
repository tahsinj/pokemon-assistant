import numpy as np
import polars as pl

from features.matchup import group_key, weighted_rows, with_mirror

NAMES = ["a_hp", "a_spe", "b_hp", "b_spe", "a_faster", "speed_ratio", "hits_diff"]


def frame():
    return pl.DataFrame({
        "a_species": ["Garchomp"], "b_species": ["Heatran"], "games": [4], "win": [0.75],
        "a_hp": [357], "a_spe": [333], "b_hp": [386], "b_spe": [253],
        "a_faster": [1.0], "speed_ratio": [333 / 253], "hits_diff": [2.0],
    })


def test_mirror_swaps_sides_and_flips_the_label():
    both = with_mirror(frame(), NAMES)
    assert both.height == 2
    m = both.row(1, named=True)
    assert (m["a_hp"], m["b_hp"]) == (386, 357)
    assert m["a_faster"] == 0.0
    assert np.isclose(m["speed_ratio"], 253 / 333)
    assert m["hits_diff"] == -2.0
    assert m["win"] == 0.25


def test_mirroring_twice_is_the_identity():
    once = with_mirror(frame(), NAMES)
    twice = with_mirror(once.slice(1, 1), NAMES).slice(1, 1)
    assert twice.select(NAMES + ["win"]).equals(frame().select(NAMES + ["win"]))


def test_group_key_ignores_side_order():
    df = pl.DataFrame({"a_species": ["A", "B"], "b_species": ["B", "A"]})
    assert group_key(df).to_list() == ["A | B", "A | B"]


def test_soft_labels_become_weighted_rows():
    x, y, w = weighted_rows(np.array([[1.0], [2.0]]), np.array([0.75, 1.0]), np.array([4, 2]))
    assert list(y) == [1, 1, 0]
    assert list(w) == [3, 2, 1]
