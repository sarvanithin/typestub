# TypeStub

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
| `typestub gen <name> --lang ts\|py\|both [--untyped]` | write stubs, runtime module, compact index |
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

`npm test` runs 56 tests: unit tests, probe→infer accuracy, generated stubs type-checked with `tsc`,
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
python runners/harness.py --run-id v0 --models claude-haiku-5-5,claude-opus-5-5 --conditions A,B,C,L --reps 5
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

Opus 5.5 coverage is partial: only the 144 filesystem episodes finished, all correct, before the API account ran
out of credits. Rerunning the same harness command resumes the rest.

## Known limitations

- Shapes that depend on the query (SQL result sets) can't be typed per tool. The SQLite server also returns
  Python `repr` text, which TypeStub types honestly as `string`.
- Semantic traps are invisible to shape inference. For example, GitHub's list endpoint reports `merged: false`
  for every PR, so only `merged_at` is reliable.
- Large APIs make large stubs. The GitHub typed stub costs about 5.6k extra prompt tokens for 12 tools, which is why
  condition L exists.
- Redaction keeps lowercase tokens such as logins and ids, so enum detection still works. Review samples before
  sharing them.
