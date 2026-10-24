# TypeStub

[![CI](https://github.com/sarvanithin/typestub/actions/workflows/ci.yml/badge.svg)](https://github.com/sarvanithin/typestub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)

Typed interfaces for MCP tool **outputs**, so code-mode agents write the right script the first time instead
of printing results to discover their shape.

MCP tools publish an `inputSchema` but rarely a usable output schema. TypeStub records real responses, infers
a schema per tool, and generates `.d.ts` and Python stubs with doc comments the model reads: presence rates,
enums, formats, pagination helpers, overloads. The MCP server never changes; TypeStub only changes what the
model reads.

```ts
// Generated from recorded traffic of a GitHub MCP server
export interface ListIssuesItem {
  number: number;
  state: "CLOSED" | "OPEN";
  assignees: string[];
  /** present in 84% */
  comments?: number;          // omitted when zero: `i.comments + 1` would be NaN
  created_at: IsoDateTime;
  /** present in 12% */
  labels?: string[];
}
export interface GithubServer {
  /** Paginated: pass `pageInfo.endCursor` back as `after` while `pageInfo.hasNextPage` is true, or use listIssuesAll(). */
  listIssues(args: ListIssuesArgs): Promise<ListIssuesResult>;
  listIssuesAll(args: Omit<ListIssuesArgs, 'after'>): Promise<ListIssuesItem[]>;
  issueRead(args: IssueReadArgs & { method: "get" }): Promise<Issue>;
  issueRead(args: IssueReadArgs & { method: "get_comments" }): Promise<IssueComment[]>;
}
```

## Quickstart

```bash
npm install && npm run build

# Probe a server's read-only tools, infer schemas, generate stubs (stdio or --url for HTTP)
npx typestub init fs --lang both -- npx -y @modelcontextprotocol/server-filesystem ./some/dir
ls stubs/   # fs.d.ts  fs.js  fs.index.md  fs.schema.json  fs.py  index.js
```

```ts
import { fs, closeAll } from './stubs/index.js';   // typed, connects lazily using the saved launch spec
const tree = await fs.directoryTree({ path: '/abs/dir' });
await closeAll();
```

Commands (`--root` sets the state directory, default `.typestub/`):

| command | what it does |
|---|---|
| `typestub probe <name> -- <cmd...>` | call read-only tools with arguments from `probe.yaml` plus auto-generated ones (ids chained from earlier responses, enum values, page sizes, cursors) |
| `typestub record <name> -- <cmd...>` | run as a recording MCP proxy on stdio: point any client at it to capture live traffic (passive mode) |
| `typestub infer <name>` | merge samples into `schema.json` (JSON Schema 2020-12 + `x-` extensions) |
| `typestub gen <name> --lang ts\|py\|both [--untyped] [--budget N] [--full]` | write stubs, runtime module, compact index |
| `typestub init <name> -- <cmd...>` | probe + infer + gen |
| `typestub watch <name> [--once]` | fold safe drift back in and regenerate; write `drift-report.md` for breaking drift |

**Safety.** Probe mode only calls tools annotated `readOnlyHint`, or tools you list under `allow:`.
Destructive tools are never called without an explicit allow. Recorded values are redacted by default:
keys, types, formats, and lowercase/uppercase enum-like tokens are kept, other strings are hashed, numbers are
bucketed, and JSON inside strings is redacted recursively. Use `--no-redact` only for samples you won't share.
Secrets go in the environment, never in `server.json`.

## How inference works

Samples are folded one at a time: same key and type increments presence, a missing key makes the field optional,
a different type widens to a union, and array elements merge into one item schema. `null` and absent are tracked
separately. A declared `outputSchema` wins where it says something, and inference fills the gaps.

Pattern rules applied after merging:

| pattern | detected by | stub shows |
|---|---|---|
| enum | ≤12 distinct token values over ≥20 observations (ids, hashes, cursors excluded); shared across tools of a server by field name when coverage is ≥50% | literal union |
| pagination | items key + next cursor / total / has-more, including nested GraphQL `pageInfo.endCursor` | `*All()` auto-paginating helper + doc |
| discriminated union | shared tag field (`type`, `kind`, …) with different key sets | one interface per tag |
| argument-selected outputs | a required enum argument (`method=get` vs `get_comments`) whose values return different shapes | TS overloads / Python `@overload` |
| formats | ISO date-time/date, UUID, URL, email | `IsoDateTime`, `Uuid`, … aliases |
| map-like objects | keys look like ids, or vary per sample | `Record<string, T>` |
| text-wrapped JSON | `content[0].text` holding JSON, **or a string field holding JSON** | parsed type; the runtime decodes it |
| recursive structures | a nested node with the same shape as an ancestor (file trees, threads) | self-referencing type |
| errors | `isError` responses | typed separately; `ToolError` documented |

Caps: depth 8, 200 fields per object. Fewer than 10 samples are marked low-confidence. The per-tool
confidence score (share of fields whose type never changed, weighted by presence) appears in the index file.

On the bundled messy mock server, field-level accuracy against a hand-written reference schema is **99.4%**
(167/168 fields), enforced as a test at ≥95%.

### Stub budget

A stub is resent on every model turn, so a big API's stub can cost more than it saves. When the typed
declarations would add more than `--budget` tokens (default 3,000), the TypeScript generator:

1. switches to compact notation: one line per interface, `/*84%*/` presence tags, and `*_url` link fields
   folded into one `[link: \`${string}url\`]: Url` signature;
2. collapses argument-selected overloads into one generic signature over a results map;
3. drops the lowest-value fields until the stub fits. Each field is scored per token it costs: shallow,
   identifying, and record-array fields score high; deep, near-absent (<10%), link-like fields and fields
   of low-confidence tools score low. Pagination keys, union tags, and identity fields (`id`, `number`,
   `name`, …) near the top are never dropped. An object that lost fields gets `[more: string]: unknown`,
   so the omitted keys stay accessible.

`--full` turns this off. Python stubs use the same pruning, with `# N%` comments and a
`# +N less-used fields omitted` line in pruned TypedDicts (GitHub: about 6.6k → 2.75k tokens).

## Runtime shim

`@typestub/shim` turns a schema into callable functions over any `callTool(name, args)`:

- `createServer(schema, callTool, { validate, drift })` unwraps results, throws `ToolError`, adds `*All()`
  helpers, decodes embedded JSON, and optionally validates responses and logs mismatches to `drift.jsonl`
  without ever blocking.
- Adapters: `mcpCallTool(client)` (generic MCP client), `toAnthropicTools` / `runAnthropicToolUse` for Anthropic
  programmatic tool calling (`code_execution_20260120`, `allowed_callers`; pass the Python emitter's
  `returnTypes` so each tool description carries its return type), and `toCodemodeTools` for Cloudflare-style
  code mode.
- Drift (`@typestub/drift`): new fields and new enum values are safe and regenerate automatically. Missing required
  fields and type changes are breaking and get flagged for review. Every stub is stamped with the server version
  and schema hash.

## Repository layout

```
packages/cli       typestub record | probe | infer | gen | init | watch
packages/recorder  MCP proxy + probe mode, JSONL samples, redaction
packages/infer     merge engine, pattern rules, confidence, accuracy scorer
packages/gen-ts    .d.ts + index emitter
packages/gen-py    TypedDict + Protocol emitter
packages/shim      runtime: unwrapping, pagination, validation, adapters
packages/drift     mismatch classifier and report
servers/messy-mock deliberately hard shapes (optional/null fields, text-JSON, unions, maps, pagination, errors)
bench/             tasks + ground truth, checkers, runners for conditions A/B/C/L, report
examples/          a typed script against the mock
```

`npm test` runs 63 tests: unit tests, probe→infer accuracy, generated stubs type-checked with `tsc`,
generated Python imported and its type hints resolved, and the CLI init + drift loop over stdio.

## Benchmark

Four conditions on the same tasks with the same model and sandbox. Only what the model reads about tools changes:

| condition | model gets | calls via |
|---|---|---|
| A. direct tool calling | tool input schemas | one round trip per call |
| B. untyped code mode | function names + input types | TypeScript in a sandbox |
| C. typed code mode | B + generated output types and docs | TypeScript in a sandbox |
| L. typed, on demand | B + an index of return types; a `types` tool loads full types for chosen functions | TypeScript in a sandbox |

The 40 tasks cover four servers: the messy mock (14), the official filesystem server (8), the reference SQLite
server (8), and the official GitHub server against the archived `atom/teletype` repo (10). Each task needs
2–60 tool calls plus filtering or joining, and has a deterministic checker. Ground truth is computed from the
seeded data or a frozen GitHub snapshot. Every task also has a reference solution (`bench/tasks/solutions/`) that
passes against the live servers (`python runners/oracle.py`). Stubs are recorded from a **separate probe pool**:
differently seeded fixtures, and other archived GitHub repos.

```bash
cd bench && uv venv .venv && uv pip install --python .venv/bin/python anthropic pyyaml numpy matplotlib
python data/make_fs.py && python data/make_sqlite.py && python tasks/build.py   # fixtures + ground truth
python runners/build_stubs.py                     # probe pool -> .typestub/<server>/schema.json
python runners/oracle.py                          # 40/40 reference solutions
echo 'ANTHROPIC_API_KEY=...' > .env               # gitignored
python runners/harness.py --run-id v0 --models claude-haiku-5-5,claude-opus-5-5 --conditions A,B,C,L --reps 5  # --max-cost USD caps spend
python report/report.py v0                        # results/v0/report.md + charts
```

Sampling uses model defaults, because current models don't accept `temperature`. CIs are 95% bootstrap over tasks.

### Results (run `v0`, Claude Haiku 5.5, 40 tasks × 4 conditions × 5 reps = 800 episodes)

Full tables with CIs: [`bench/results/v0/report.md`](bench/results/v0/report.md). C vs B, 95% bootstrap CI over tasks:

| server | tokens / completed task | first-try success | task success | round trips |
|---|---|---|---|---|
| messy mock | **−45.6%** [−52.5, −38.8] | **+40 pts** [21, 59] | ±0 | −2.5 |
| filesystem | −0.4% [−22.5, 24.3] | ±0 | ±0 | −0.65 |
| sqlite | −0.7% [−12.0, 13.5] | ±0 | +2.5 pts | −0.42 |
| github | **+49.2%** [19.3, 92.8] | +8 pts | −8 pts | −0.76 |
| all | −3.3% [−20.1, 17.2] | +16 pts [7.5, 25.5] | −1.5 pts | −1.29 |

What this says, using the decision rule from the design doc:

- **The mechanism works.** On the messy mock, typed stubs nearly halve tokens per completed task, cut round trips
  from 4.3 to 1.8, and lift first-try success from 0% to 40%, with no loss in task success.
- **It doesn't carry over to GitHub yet.** That points at real-world coverage and stub cost, not at the idea.
  The typed GitHub stub costs about 5.6k extra prompt tokens on every turn (target: under 1.5k). The 3 failures
  out of 5 on `gh-merged-prs` came from the model trusting `merged: boolean` in one shot, but the field is always
  `false` on that endpoint. A planned rule will flag fields whose value never varied across samples.
- **Filesystem and SQLite are flat, as expected.** Their outputs are plain text (`{content: string}`, Python
  `repr`), so there's nothing to type.
- **Loading types on demand (L) doesn't help.** The extra round trip to fetch types costs more than it saves
  (+36% tokens vs B).
- **Most of the remaining round trips aren't shape discovery.** First-try success stays low because Haiku tends to
  print its computed answer in one script, then submit it in the next.
- **v0 criteria met: none overall.** The −30% cost target and the +20 pt reliability target are met only on the
  messy mock.

### Rerun: GitHub with a budgeted stub (run `v1-github`, Haiku, 10 tasks × 4 conditions × 5 reps)

The GitHub typed stub was cut from 5,560 to **2,318** extra prompt tokens (−58%, budget 2,500) and the
GitHub tasks were rerun. Every field the tasks read survived the pruning.

| GitHub, C vs B | v0 (full stub) | v1 (budgeted stub) |
|---|---|---|
| tokens / completed task | +49.2% [19.3, 92.8] | **+22.7%** [5.4, 37.9] |
| task success (C) | 92% | **98%** (B: 98%) |
| first-try success | +8 pts | +4 pts |
| round trips | −0.76 | −0.20 |

With these GitHub numbers swapped into the Haiku results, typed vs untyped overall is **−10.5%** tokens
[−23.5, 2.4] (was −3.3%) and +15 pts first-try success, with no loss in task success. GitHub is still a net cost:
the stub is still 800 tokens over the doc's 1,500 target, and most extra round trips are the model printing a
computed answer before submitting it, not shape discovery. At 1,500 tokens the pruner has to drop fields the
tasks need (`merged_at`, `files[].changes`, `user`), so 2,500 was used. Combined report: `bench/results/v1-haiku/report.md`.

### Opus 5.5 (run `v1-opus`, untyped B vs typed C, 308 of 330 episodes)

The remaining credit covered B and C only. A and L were skipped (on Haiku, L lost to B everywhere), and an $8
spending cap (`--max-cost`) stopped the run 22 episodes short of 5 reps (mock 67/70 and sqlite 32/40 per
condition). Episodes run rep-major, so every task has at least 3 reps. GitHub uses the budgeted stub.

| server | tokens / completed task, C vs B | round trips B → C | task success |
|---|---|---|---|
| messy mock | −6.6% [−21.8, 12.2] | 3.87 → **2.58** | 100% both |
| filesystem | +3.5% [−12.9, 23.4] | 3.17 → 2.90 | 100% both |
| sqlite | +1.0% [−9.9, 18.3] | 3.75 → 3.41 | 100% both |
| github | **+34.4%** [3.8, 69.9] | 2.72 → 2.70 | 100% both |
| all | +9.3% [−5.3, 24.9] | 3.40 → **2.82** | 100% both |

- Opus already writes efficient untyped scripts, so types cut round trips (−0.58 overall, CI excludes 0)
  without cutting raw tokens. Raw tokens overstate the re-sent stub's cost, though; see billed tokens below.
- First-try success is 0% for both conditions because Opus never submits from its first script: in 92% of
  episodes the last turn is a bare `submit(x)` after printing the answer. That turn costs every code-mode
  condition one round trip. The benchmark's submit protocol, not the types, is the main thing keeping round
  trips above the doc's 1.5 target.

### Billed tokens: re-scoring the same episodes with cache weights

The runs use prompt caching, so after the first turn the system prompt (and the stub in it) is a cache read,
billed at 0.1× input. "Tokens / completed task" above sums cache reads at full weight. That overcounts exactly
the cost blamed for the GitHub and Opus results: the stub being re-sent every turn. Cache reads are 70–89% of all
tokens in these runs. Below, the same episodes are re-scored with the weights the harness spend cap uses (cache
reads 0.1×, cache writes 1.25×, output at the output/input price ratio), in input-token equivalents. No new API calls.

| C vs B | raw tokens / completed task | **billed** tokens / completed task |
|---|---|---|
| Haiku, all servers (`v1-haiku`) | −10.5% [−22.9, 2.5] | **−26.8%** [−36.8, −16.8] |
| Haiku, messy mock | −45.6% | **−57.6%** [−63.2, −51.0] |
| Haiku, GitHub | +22.7% [5.3, 38.2] | **−5.0%** [−15.4, 4.4] |
| Opus, all servers (`v1-opus`) | +9.3% [−4.7, 25.4] | **−15.7%** [−24.9, −5.4] |
| Opus, messy mock | −6.6% | **−35.3%** [−44.8, −23.5] |
| Opus, GitHub | +34.4% [3.3, 69.5] | +7.9% [−7.9, 27.0] |

Priced as billed, typed stubs are cheaper overall for both models (CIs exclude 0). GitHub moves from a clear loss
to roughly break-even: slightly cheaper on Haiku, not significantly dearer on Opus. The −30% target is still
missed overall (−26.8% Haiku), and met on the messy mock for both models.

**First fetch right.** First-try success can't separate B and C on Opus, because Opus never submits from its
first script. A second metric, computed from the same logs, asks whether the first script ran cleanly and fetched
everything: later scripts made no tool calls, and the answer passed. A submit-only turn doesn't count against it.
C vs B: **+31.5 pts** on Haiku [20.0, 43.5] and **+20.6 pts** on Opus [6.3, 34.8], which meets the +20 pt
reliability target on that definition. Both metrics are in every `report.md`.

**Submit protocol for future runs.** The sandbox already took a script's return value as its answer, but the
prompt only described `submit()` and warned against submitting early. The prompt now says to end the script with
`return answer`. Runs before this change used the old prompt.

## Known limitations

- Shapes that depend on the query (SQL result sets) can't be typed per tool. The SQLite server also returns
  Python `repr` text, which TypeStub types honestly as `string`.
- Semantic traps are mostly invisible to shape inference. One kind is now caught: a boolean or token string that
  never varied over 20+ samples gets `x-constant`, and the stub says so (`always false in all 214 samples; don't
  filter on it alone`). On the GitHub probe pool this flags `merged` on `list_pull_requests` (only `merged_at` is
  reliable) and 6 other fields. The bench runs above predate the rule.
- Large APIs make large stubs. The stub budget cut GitHub's from 5.6k to 2.3k extra tokens for 12 tools, but that
  is still above 1,500, and pruning further removes fields tasks need.
- Redaction keeps lowercase tokens such as logins and ids, so enum detection still works. Review samples before
  sharing them.
