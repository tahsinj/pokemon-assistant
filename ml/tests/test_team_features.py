from features.team import mon_tokens


def test_tokens_match_the_app():
    # src/renderer/src/ml/teamModel.test.ts checks the same cases on the app side.
    revealed = {"item": "boosterenergy", "ability": "protosynthesis", "tera": "steel",
                "moves": ["rapidspin", "headlongrush", "icespinner", "knockoff", "bulkup"]}
    assert mon_tokens("greattusk", revealed) == [
        "s:greattusk", "i:boosterenergy", "a:protosynthesis", "t:steel",
        "m:rapidspin", "m:headlongrush", "m:icespinner", "m:knockoff",
    ]
    assert mon_tokens("rotomwash", None) == ["s:rotomwash"]
