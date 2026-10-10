# Bot strength

Measured by `npm run bots:gauntlet` on 2026-10-10: random battle teams under Gen 9 OU
rules, sides swapped every game. Elo has Random fixed at 1000.

| Bot | Elo |
| --- | --- |
| Random (level 0) | 1000 |
| Greedy (level 1) | 1552 |
| Search (level 2) | 1780 |
| MCTS (level 3) | 1794 |

| Pairing | Score | Win rate (95% interval) |
| --- | --- | --- |
| Greedy vs Random | 96/100 | 96% (90% to 98%) |
| Search vs Greedy | 77/100 | 77% (68% to 84%) |
| Search vs Random | 99/100 | 99% (95% to 100%) |
| MCTS vs Search | 64/100 | 64% (54% to 73%) |
| MCTS vs Greedy | 71/100 | 71% (61% to 79%) |
