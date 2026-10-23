# TypeStub benchmark results: `v1-opus`

378 episodes (0 dropped for API errors). Values are point estimates with 95% bootstrap CIs over tasks.
Sampling: model defaults (these models do not accept `temperature`), effort medium.

## claude-opus-5-5

| server | condition | task success | first-try success | round trips | tokens / completed task | tokens / episode | non-submitting scripts | wall s |
|---|---|---|---|---|---|---|---|---|
| filesystem | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.17 [2.85, 3.52] | 8,151 [7,006, 9,513] | 8,151 [6,971, 9,651] | 1.82 [1.52, 2.05] | 7.03 [5.83, 8.42] |
| filesystem | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.90 [2.55, 3.25] | 8,438 [7,358, 9,464] | 8,438 [7,394, 9,491] | 1.65 [1.38, 1.88] | 7.07 [6.17, 8.04] |
| github | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.72 [2.40, 3.10] | 15,928 [13,723, 18,637] | 15,928 [13,746, 18,792] | 1.28 [1.10, 1.50] | 9.71 [7.40, 12.31] |
| github | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.70 [2.38, 3.08] | 21,400 [18,596, 25,248] | 21,400 [18,442, 24,784] | 1.30 [1.08, 1.54] | 9.75 [6.98, 12.60] |
| messy-mock | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.87 [3.57, 4.20] | 15,206 [13,247, 17,398] | 15,206 [13,210, 17,416] | 2.79 [2.51, 3.12] | 11.26 [9.70, 12.92] |
| messy-mock | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.58 [2.30, 2.90] | 14,198 [12,398, 16,243] | 14,198 [12,282, 16,157] | 1.45 [1.23, 1.68] | 6.71 [5.77, 7.70] |
| sqlite | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.75 [3.50, 3.94] | 7,330 [6,246, 8,325] | 7,330 [6,238, 8,273] | 2.34 [2.12, 2.59] | 9.69 [7.71, 11.75] |
| sqlite | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.41 [3.16, 3.69] | 7,406 [6,671, 8,364] | 7,406 [6,642, 8,367] | 2.34 [2.12, 2.59] | 8.16 [6.15, 11.10] |
| all | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.40 [3.18, 3.61] | 12,570 [11,068, 14,161] | 12,570 [11,071, 14,140] | 2.11 [1.88, 2.35] | 9.69 [8.60, 10.86] |
| all | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.82 [2.63, 3.02] | 13,734 [11,760, 15,789] | 13,734 [11,774, 15,852] | 1.60 [1.45, 1.77] | 7.83 [6.86, 8.84] |

**Typed (C) vs untyped (B) code mode**

| server | tokens / completed task | first-try success | task success | round trips |
|---|---|---|---|---|
| filesystem | 3.5% [-12.9, 23.4] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.27 [-0.73, 0.17] |
| github | 34.4% [3.8, 69.9] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.02 [-0.60, 0.52] |
| messy-mock | -6.6% [-21.8, 12.2] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -1.28 [-1.73, -0.84] |
| sqlite | 1.0% [-9.9, 18.3] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.34 [-0.72, 0.09] |
| all | 9.3% [-5.3, 24.9] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.58 [-0.86, -0.28] |

**Stub overhead** (system prompt tokens, counted with the token-counting API; L also pays for `types` results inside the episode)

| server | untyped (B) | typed (C) | C overhead | lazy (L) | L overhead |
|---|---|---|---|---|---|
| filesystem | 1,402 | 1,908 | 506 | 2,085 | 683 |
| github | 4,585 | 6,903 | 2,318 | 5,441 | 856 |
| messy-mock | 1,585 | 4,513 | 2,928 | 2,104 | 519 |
| sqlite | 586 | 792 | 206 | 763 | 177 |

**v0 success criteria**

| area | metric | target | measured | met |
|---|---|---|---|---|
| Cost | tokens per completed task, C vs B | ≤ -30% | 9.3% [-5.3, 24.9] | no |
| Reliability | first-try execution success, C vs B | ≥ +20 pts | 0.0% [0.0, 0.0] | no |
| Speed | round trips per task (C) | ≤ 1.5 | 2.82 [2.63, 3.02] | no |
| Quality | task success, C vs B | no drop | 0.0% [0.0, 0.0] | yes |
| Overhead | typed stub tokens (worst server) | < 1,500 | 2,928 | no |

![chart](chart-claude-opus-5-5.png)

