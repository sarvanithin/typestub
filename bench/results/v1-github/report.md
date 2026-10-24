# TypeStub benchmark results: `v1-github`

200 episodes (0 dropped for API errors). Values are point estimates with 95% bootstrap CIs over tasks.
Billed tokens weight each episode as it is billed, in input-token equivalents: cache reads 0.1x, cache writes 1.25x, output at the output/input price ratio. Raw tokens count cache reads at full weight, which overstates the cost of a stub that sits in the cached system prompt. First fetch right: the first script ran cleanly, later scripts made no tool calls, and the answer passed (a separate submit-only turn does not count against it).
Sampling: model defaults (these models do not accept `temperature`), effort medium.

## claude-haiku-5-5

| server | condition | task success | first-try success | first fetch right | round trips | tokens / completed task | billed tokens / completed task | tokens / episode | non-submitting scripts | wall s |
|---|---|---|---|---|---|---|---|---|---|---|
| github | A | 98.0% [94.0, 100.0] | — | — | 2.62 [2.14, 3.28] | 33,799 [17,057, 61,791] | 17,743 [8,427, 31,880] | 33,123 [17,164, 60,927] | 0.00 [0.00, 0.00] | 8.96 [4.25, 15.63] |
| github | B | 98.0% [94.0, 100.0] | 0.0% [0.0, 0.0] | 28.0% [8.0, 52.0] | 3.30 [2.78, 3.82] | 22,236 [18,237, 26,098] | 10,681 [8,427, 13,133] | 21,791 [17,795, 25,629] | 2.02 [1.58, 2.44] | 11.68 [6.85, 18.12] |
| github | C | 98.0% [94.0, 100.0] | 4.0% [0.0, 10.0] | 46.0% [20.0, 72.0] | 3.10 [2.48, 3.74] | 27,285 [20,945, 34,608] | 10,152 [7,537, 13,184] | 26,739 [20,533, 32,930] | 1.66 [1.26, 2.04] | 13.81 [6.08, 25.74] |
| github | L | 100.0% [100.0, 100.0] | 6.0% [0.0, 18.0] | 52.0% [32.0, 72.0] | 4.02 [3.44, 4.60] | 32,635 [27,221, 38,628] | 13,047 [10,788, 15,313] | 32,635 [27,019, 38,663] | 1.64 [1.22, 2.08] | 12.89 [8.43, 17.75] |
| all | A | 98.0% [94.0, 100.0] | — | — | 2.62 [2.14, 3.34] | 33,799 [17,305, 63,139] | 17,743 [8,158, 31,373] | 33,123 [17,202, 60,734] | 0.00 [0.00, 0.00] | 8.96 [4.02, 15.78] |
| all | B | 98.0% [94.0, 100.0] | 0.0% [0.0, 0.0] | 28.0% [8.0, 52.0] | 3.30 [2.76, 3.86] | 22,236 [18,597, 26,000] | 10,681 [8,373, 13,321] | 21,791 [17,757, 25,918] | 2.02 [1.60, 2.44] | 11.68 [7.03, 17.99] |
| all | C | 98.0% [94.0, 100.0] | 4.0% [0.0, 10.0] | 46.0% [20.0, 72.0] | 3.10 [2.46, 3.70] | 27,285 [20,464, 34,350] | 10,152 [7,600, 13,233] | 26,739 [20,489, 32,791] | 1.66 [1.24, 2.04] | 13.81 [6.33, 26.01] |
| all | L | 100.0% [100.0, 100.0] | 6.0% [0.0, 18.0] | 52.0% [32.0, 72.0] | 4.02 [3.44, 4.62] | 32,635 [26,851, 38,456] | 13,047 [10,678, 15,251] | 32,635 [27,113, 38,621] | 1.64 [1.22, 2.08] | 12.89 [8.42, 17.94] |

**Typed (C) vs untyped (B) code mode**

| server | tokens / completed task | billed tokens / completed task | first-try success | first fetch right | task success | round trips |
|---|---|---|---|---|---|---|
| github | 22.7% [5.2, 37.8] | -5.0% [-15.6, 4.3] | 4.0% [0.0, 10.0] pts | 18.0% [0.0, 40.0] pts | 0.0% [-6.0, 6.0] pts | -0.20 [-0.50, 0.08] |
| all | 22.7% [4.8, 37.9] | -5.0% [-15.4, 4.4] | 4.0% [0.0, 8.0] pts | 18.0% [0.0, 40.0] pts | 0.0% [-6.0, 6.0] pts | -0.20 [-0.52, 0.08] |

**Typed on demand (L) vs untyped (B) code mode**

| server | tokens / completed task | billed tokens / completed task | first-try success | first fetch right | task success | round trips |
|---|---|---|---|---|---|---|
| github | 46.8% [19.4, 77.2] | 22.2% [-5.5, 50.5] | 6.0% [0.0, 18.0] pts | 24.0% [2.0, 46.0] pts | 2.0% [0.0, 6.0] pts | 0.72 [0.02, 1.40] |
| all | 46.8% [18.3, 77.5] | 22.2% [-5.5, 49.5] | 6.0% [0.0, 18.0] pts | 24.0% [2.0, 46.0] pts | 2.0% [0.0, 6.0] pts | 0.72 [0.02, 1.40] |

**Stub overhead** (system prompt tokens, counted with the token-counting API; L also pays for `types` results inside the episode)

| server | untyped (B) | typed (C) | C overhead | lazy (L) | L overhead |
|---|---|---|---|---|---|
| github | 4,585 | 6,903 | 2,318 | 5,441 | 856 |

**v0 success criteria**

| area | metric | target | measured | met |
|---|---|---|---|---|
| Cost | tokens per completed task, C vs B | ≤ -30% | 22.7% [4.8, 37.9] | no |
| Cost (billed) | billed tokens per completed task, C vs B | ≤ -30% | -5.0% [-15.4, 4.4] | no |
| Reliability | first-try execution success, C vs B | ≥ +20 pts | 4.0% [0.0, 8.0] | no |
| Speed | round trips per task (C) | ≤ 1.5 | 3.10 [2.46, 3.70] | no |
| Quality | task success, C vs B | no drop | 0.0% [-6.0, 6.0] | yes |
| Overhead | typed stub tokens (worst server) | < 1,500 | 2,318 | no |

![chart](chart-claude-haiku-5-5.png)

