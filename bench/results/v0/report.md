# TypeStub benchmark results: `v0`

944 episodes (656 dropped for API errors). Values are point estimates with 95% bootstrap CIs over tasks.
Sampling: model defaults (these models do not accept `temperature`), effort medium.

## claude-haiku-5-5

| server | condition | task success | first-try success | round trips | tokens / completed task | tokens / episode | non-submitting scripts | wall s |
|---|---|---|---|---|---|---|---|---|
| filesystem | A | 100.0% [100.0, 100.0] | — | 3.48 [3.15, 3.77] | 11,749 [9,620, 14,257] | 11,749 [9,528, 14,358] | 0.00 [0.00, 0.00] | 4.83 [3.68, 6.40] |
| filesystem | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 4.25 [3.83, 4.78] | 12,473 [10,068, 15,462] | 12,473 [10,158, 15,444] | 2.75 [2.35, 3.12] | 5.35 [4.43, 6.48] |
| filesystem | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.60 [3.10, 4.12] | 12,417 [10,215, 14,815] | 12,417 [10,283, 14,869] | 2.30 [1.90, 2.68] | 4.65 [3.95, 5.26] |
| filesystem | L | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 4.60 [4.22, 4.95] | 19,156 [16,741, 21,513] | 19,156 [16,916, 21,462] | 2.73 [2.30, 3.17] | 6.34 [5.41, 7.06] |
| github | A | 98.0% [94.0, 100.0] | — | 2.48 [2.16, 2.88] | 25,753 [17,549, 36,611] | 25,238 [17,389, 34,509] | 0.00 [0.00, 0.00] | 7.46 [3.96, 11.89] |
| github | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.36 [2.74, 4.04] | 22,222 [17,314, 27,565] | 22,222 [17,320, 27,520] | 2.10 [1.56, 2.74] | 10.00 [6.26, 14.32] |
| github | C | 92.0% [80.0, 100.0] | 8.0% [0.0, 20.0] | 2.60 [2.08, 3.36] | 33,146 [24,898, 44,595] | 30,494 [23,660, 39,844] | 1.44 [1.10, 1.92] | 11.40 [5.61, 18.61] |
| github | L | 100.0% [100.0, 100.0] | 4.0% [0.0, 8.0] | 4.46 [3.80, 5.14] | 39,848 [31,765, 47,756] | 39,848 [31,644, 47,637] | 1.86 [1.44, 2.32] | 16.13 [8.36, 27.73] |
| messy-mock | A | 100.0% [100.0, 100.0] | — | 3.20 [2.66, 3.83] | 43,492 [21,118, 70,181] | 43,492 [20,327, 71,835] | 0.00 [0.00, 0.00] | 9.63 [5.08, 16.90] |
| messy-mock | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 4.30 [3.97, 4.64] | 17,897 [15,755, 20,012] | 17,897 [15,644, 20,112] | 2.86 [2.56, 3.13] | 7.43 [6.45, 8.45] |
| messy-mock | C | 100.0% [100.0, 100.0] | 40.0% [21.4, 58.6] | 1.79 [1.54, 2.03] | 9,732 [8,355, 11,042] | 9,732 [8,456, 10,978] | 0.79 [0.54, 1.01] | 2.80 [2.40, 3.18] |
| messy-mock | L | 100.0% [100.0, 100.0] | 8.6% [1.4, 20.0] | 3.57 [3.27, 3.89] | 15,855 [13,992, 17,546] | 15,855 [13,913, 17,533] | 1.37 [1.16, 1.60] | 5.44 [4.79, 6.06] |
| sqlite | A | 100.0% [100.0, 100.0] | — | 4.55 [4.27, 4.88] | 8,158 [6,053, 10,980] | 8,158 [5,973, 10,983] | 0.00 [0.00, 0.00] | 5.33 [4.56, 6.16] |
| sqlite | B | 95.0% [85.0, 100.0] | 0.0% [0.0, 0.0] | 4.25 [3.90, 4.55] | 9,128 [7,289, 11,057] | 8,672 [7,104, 10,353] | 3.27 [2.88, 3.62] | 5.77 [4.45, 7.23] |
| sqlite | C | 97.5% [92.5, 100.0] | 0.0% [0.0, 0.0] | 3.83 [3.50, 4.12] | 9,062 [7,379, 10,976] | 8,836 [7,490, 10,402] | 3.17 [2.88, 3.52] | 4.74 [4.19, 5.34] |
| sqlite | L | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 4.65 [4.20, 5.12] | 13,300 [10,884, 16,167] | 13,300 [10,999, 15,880] | 3.40 [3.08, 3.78] | 5.76 [4.97, 6.67] |
| all | A | 99.5% [98.5, 100.0] | — | 3.35 [3.02, 3.68] | 25,641 [16,808, 37,015] | 25,513 [16,556, 36,060] | 0.00 [0.00, 0.00] | 7.27 [5.10, 10.33] |
| all | B | 99.0% [97.0, 100.0] | 0.0% [0.0, 0.0] | 4.04 [3.77, 4.31] | 16,211 [14,108, 18,484] | 16,048 [13,905, 18,524] | 2.73 [2.47, 2.97] | 7.32 [6.16, 8.62] |
| all | C | 97.5% [93.5, 100.0] | 16.0% [7.5, 25.5] | 2.76 [2.42, 3.13] | 15,672 [12,456, 19,721] | 15,280 [12,174, 19,161] | 1.73 [1.41, 2.04] | 5.71 [4.07, 8.00] |
| all | L | 100.0% [100.0, 100.0] | 4.0% [1.0, 8.5] | 4.21 [3.95, 4.49] | 22,003 [18,309, 26,298] | 22,003 [18,380, 26,055] | 2.17 [1.88, 2.47] | 8.36 [6.12, 11.95] |

**Typed (C) vs untyped (B) code mode**

| server | tokens / completed task | first-try success | task success | round trips |
|---|---|---|---|---|
| filesystem | -0.4% [-22.5, 24.3] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.65 [-1.32, -0.05] |
| github | 49.2% [19.3, 92.8] | 8.0% [0.0, 20.0] pts | -8.0% [-20.0, 0.0] pts | -0.76 [-1.52, 0.04] |
| messy-mock | -45.6% [-52.5, -38.8] | 40.0% [21.4, 58.6] pts | 0.0% [0.0, 0.0] pts | -2.51 [-2.80, -2.24] |
| sqlite | -0.7% [-12.0, 13.5] | 0.0% [0.0, 0.0] pts | 2.5% [0.0, 7.5] pts | -0.42 [-0.88, 0.03] |
| all | -3.3% [-20.1, 17.2] | 16.0% [7.5, 25.5] pts | -1.5% [-5.0, 1.0] pts | -1.29 [-1.68, -0.90] |

**Typed on demand (L) vs untyped (B) code mode**

| server | tokens / completed task | first-try success | task success | round trips |
|---|---|---|---|---|
| filesystem | 53.6% [21.4, 84.5] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | 0.35 [-0.30, 0.92] |
| github | 79.3% [36.7, 140.2] | 4.0% [0.0, 10.0] pts | 0.0% [0.0, 0.0] pts | 1.10 [0.44, 1.76] |
| messy-mock | -11.4% [-21.9, 1.6] | 8.6% [0.0, 20.0] pts | 0.0% [0.0, 0.0] pts | -0.73 [-1.03, -0.40] |
| sqlite | 45.7% [22.5, 65.8] | 0.0% [0.0, 0.0] pts | 5.0% [0.0, 15.0] pts | 0.40 [0.08, 0.77] |
| all | 35.7% [17.1, 59.4] | 4.0% [1.0, 8.0] pts | 1.0% [0.0, 3.0] pts | 0.17 [-0.18, 0.52] |

**Stub overhead** (system prompt tokens, counted with the token-counting API; L also pays for `types` results inside the episode)

| server | untyped (B) | typed (C) | C overhead | lazy (L) | L overhead |
|---|---|---|---|---|---|
| filesystem | 1,402 | 1,908 | 506 | 2,085 | 683 |
| github | 4,585 | 10,145 | 5,560 | 5,445 | 860 |
| messy-mock | 1,585 | 4,513 | 2,928 | 2,104 | 519 |
| sqlite | 586 | 792 | 206 | 763 | 177 |

**v0 success criteria**

| area | metric | target | measured | met |
|---|---|---|---|---|
| Cost | tokens per completed task, C vs B | ≤ -30% | -3.3% [-20.1, 17.2] | no |
| Reliability | first-try execution success, C vs B | ≥ +20 pts | 16.0% [7.5, 25.5] | no |
| Speed | round trips per task (C) | ≤ 1.5 | 2.76 [2.42, 3.13] | no |
| Quality | task success, C vs B | no drop | -1.5% [-5.0, 1.0] | no |
| Overhead | typed stub tokens (worst server) | < 1,500 | 5,560 | no |

![chart](chart-claude-haiku-5-5.png)

## claude-opus-5-5

| server | condition | task success | first-try success | round trips | tokens / completed task | tokens / episode | non-submitting scripts | wall s |
|---|---|---|---|---|---|---|---|---|
| filesystem | A | 100.0% [100.0, 100.0] | — | 3.44 [2.90, 3.88] | 10,838 [8,365, 13,718] | 10,838 [8,329, 13,732] | 0.00 [0.00, 0.00] | 9.07 [5.98, 13.03] |
| filesystem | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.20 [2.83, 3.57] | 8,224 [6,877, 9,834] | 8,224 [6,877, 9,902] | 1.80 [1.54, 2.06] | 7.13 [5.78, 8.72] |
| filesystem | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.77 [2.46, 3.06] | 8,092 [7,130, 8,969] | 8,092 [7,099, 8,990] | 1.60 [1.34, 1.83] | 6.70 [6.02, 7.47] |
| filesystem | L | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.57 [3.14, 3.94] | 13,049 [11,076, 15,018] | 13,049 [11,014, 15,030] | 1.83 [1.46, 2.17] | 8.21 [6.61, 9.80] |
| all | A | 100.0% [100.0, 100.0] | — | 3.44 [2.92, 3.92] | 10,838 [8,228, 13,672] | 10,838 [8,279, 13,676] | 0.00 [0.00, 0.00] | 9.07 [6.10, 13.25] |
| all | B | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.20 [2.83, 3.57] | 8,224 [6,904, 9,841] | 8,224 [6,851, 9,969] | 1.80 [1.54, 2.06] | 7.13 [5.68, 8.67] |
| all | C | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 2.77 [2.43, 3.09] | 8,092 [7,108, 8,959] | 8,092 [7,146, 8,990] | 1.60 [1.34, 1.86] | 6.70 [5.96, 7.42] |
| all | L | 100.0% [100.0, 100.0] | 0.0% [0.0, 0.0] | 3.57 [3.17, 3.94] | 13,049 [11,014, 14,922] | 13,049 [11,017, 14,941] | 1.83 [1.46, 2.17] | 8.21 [6.58, 9.84] |

**Typed (C) vs untyped (B) code mode**

| server | tokens / completed task | first-try success | task success | round trips |
|---|---|---|---|---|
| filesystem | -1.6% [-17.9, 16.2] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.43 [-0.86, -0.06] |
| all | -1.6% [-16.4, 17.4] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | -0.43 [-0.86, -0.03] |

**Typed on demand (L) vs untyped (B) code mode**

| server | tokens / completed task | first-try success | task success | round trips |
|---|---|---|---|---|
| filesystem | 58.7% [40.5, 82.8] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | 0.37 [0.11, 0.66] |
| all | 58.7% [39.9, 82.8] | 0.0% [0.0, 0.0] pts | 0.0% [0.0, 0.0] pts | 0.37 [0.11, 0.66] |

**Stub overhead** (system prompt tokens, counted with the token-counting API; L also pays for `types` results inside the episode)

| server | untyped (B) | typed (C) | C overhead | lazy (L) | L overhead |
|---|---|---|---|---|---|
| filesystem | 1,402 | 1,908 | 506 | 2,085 | 683 |
| github | 4,585 | 10,145 | 5,560 | 5,445 | 860 |
| messy-mock | 1,585 | 4,513 | 2,928 | 2,104 | 519 |
| sqlite | 586 | 792 | 206 | 763 | 177 |

**v0 success criteria**

| area | metric | target | measured | met |
|---|---|---|---|---|
| Cost | tokens per completed task, C vs B | ≤ -30% | -1.6% [-16.4, 17.4] | no |
| Reliability | first-try execution success, C vs B | ≥ +20 pts | 0.0% [0.0, 0.0] | no |
| Speed | round trips per task (C) | ≤ 1.5 | 2.77 [2.43, 3.09] | no |
| Quality | task success, C vs B | no drop | 0.0% [0.0, 0.0] | yes |
| Overhead | typed stub tokens (worst server) | < 1,500 | 5,560 | no |

![chart](chart-claude-opus-5-5.png)

## Dropped episodes

- claude-opus-5-5 A fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 L fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 L fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 L fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 L fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 L fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B fs-alpha-src-lines: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 A gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 A gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 A gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 A gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 A gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 B gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
- claude-opus-5-5 C gh-open-bugs-unassigned: api: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low to access the An
