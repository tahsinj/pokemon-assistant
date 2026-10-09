# Bot strength

Measured by `npm run bots:gauntlet` on 2026-10-07: random battle teams under Gen 9 OU
rules, sides swapped every game. Elo has Random fixed at 1000.

| Bot | Elo |
| --- | --- |
| Random (level 0) | 1000 |
| Greedy (level 1) | 1616 |
| Search (level 2) | 1755 |

| Pairing | Score | Win rate (95% interval) |
| --- | --- | --- |
| Greedy vs Random | 486/500 | 97% (95% to 98%) |
| Search vs Greedy | 379/500 | 76% (72% to 79%) |
| Search vs Random | 491/500 | 98% (97% to 99%) |
