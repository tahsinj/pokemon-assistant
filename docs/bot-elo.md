# Bot strength

Measured by `npm run bots:gauntlet` on 2026-10-04: random battle teams under Gen 9 OU
rules, sides swapped every game. Elo has Random fixed at 1000.

| Bot | Elo |
| --- | --- |
| Random (level 0) | 1000 |
| Greedy (level 1) | 1552 |
| Search (level 2) | 1757 |

| Pairing | Score | Win rate (95% interval) |
| --- | --- | --- |
| Greedy vs Random | 96/100 | 96% (90% to 98%) |
| Search vs Greedy | 72/100 | 72% (63% to 80%) |
| Search vs Random | 99/100 | 99% (95% to 100%) |
