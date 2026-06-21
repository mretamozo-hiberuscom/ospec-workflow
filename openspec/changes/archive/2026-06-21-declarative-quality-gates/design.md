# Design: Declarative Quality Gates

## Technical Approach

Turn the scattered verify settings into a single typed `quality_gates:` policy that
`sdd-verify` enforces and audits. Following the repo's established "pure decision core +
agent as effect layer" pattern (see `scripts/lib/route-dispatcher.js` and
`scripts/lib/lifecycle-hooks.js`), all policy parsing, validation, per-gate
classification, enforcement mapping, top-level aggregation, and audit-block shaping live
in a new pure module `scripts/lib/quality-gates.js`. The `sdd-verify` agent is the only
effect layer: it reads `config.yaml`, executes each gate's shell command via its
`execute` tool, captures exit codes and coverage stdout, feeds those into the pure
functions, and writes `verify-report.md` + `state.yaml`. The orchestrator owns the
archive-block decision and override audit. This satisfies all MUST scenarios in
`specs/quality-gates/spec.md`, `specs/agents/spec.md`, and `specs/routing/spec.md`.

## Architecture Decisions

### Decision: Pure decision core in `scripts/lib/quality-gates.js`

**Choice**: A zero-side-effect module exporting `KNOWN_GATES`, `KNOWN_ON_FAIL`,
`parseQualityGates`, `validateQualityGates`, `parseCoverage`, `classifyGate`,
`enforceGate`, `aggregateStatus`, and `buildAuditBlock`. The agent runs commands; the
module decides outcomes.

**Alternatives considered**: (a) put all gate logic inline in the `sdd-verify` SKILL
prose; (b) a stateful class that shells out internally.

**Rationale**: The route-dispatcher/lifecycle-hooks precedent proves that decision logic
(parse/validate/classify/aggregate) is deterministic on its arguments and therefore
unit-testable with the Node native runner, while I/O (config read, command execution,
state writes) stays in the agent where it cannot be unit-tested anyway. Inline prose
logic (a) is untestable and drifts; a shelling class (b) breaks purity and makes the
classification rules impossible to test without spawning processes. The boundary keeps
`npm test` meaningful (Strict TDD).

### Decision: `on_fail` defaults to `advisory` for every gate

**Choice**: `parseQualityGates` sets `on_fail: advisory` on every gate unless the policy
explicitly declares `halt`. No coupling to `required`; no validation warning when
`required: true` lacks `halt`.

**Rationale**: Authoritative clarify decision (`clarify-on-fail-default`). Only an
explicit `on_fail: halt` produces a BLOCKER / archive block. This makes the safe default
non-blocking and forces operators to opt into hard gates.

### Decision: Coverage measured via optional `tests.coverage.command`

**Choice**: Coverage is a sub-check of the `tests` gate only. When
`tests.coverage.minimum` is set, the agent runs `tests.coverage.command`; its stdout is
parsed by the pure `parseCoverage(stdout)`. Absent command → coverage check skipped with
warning, gate NOT failed.

**Rationale**: Authoritative clarify decision (`clarify-coverage-measurement`). Keeping
`parseCoverage` pure isolates the brittle stdout-parsing from the I/O of running the
command, so malformed-stdout handling is fully unit-tested.

### Decision: Override is an orchestrator effect, audited in two places

**Choice**: The pure module produces the audit block (including `status: fail`); the
orchestrator, on user-provided written justification, appends
`gates.quality-gates.override {timestamp, justification}` to `state.yaml` AND an Override
section to `verify-report.md` before dispatching `sdd-archive`.

**Rationale**: Authoritative clarify decision (`clarify-archive-override`). Override is a
human/orchestrator decision, not a verify-time computation, so it stays outside the pure
core; full traceability requires both audit destinations written before dispatch.

## Policy Schema

```yaml
quality_gates:                 # OPTIONAL — absence is a strict no-op
  tests:
    required: false            # boolean, default false
    on_fail: advisory          # advisory (default) | halt
    command: "npm test"        # absent/empty => skipped-with-warning
    timeout_ms: 120000         # OPTIONAL positive int; default DEFAULT_GATE_TIMEOUT_MS; timeout => error (H5)
    coverage:
      minimum: 80              # number in [0,100]; non-numeric/out-of-range => check disabled + validation error (H6)
      command: "npm run coverage:pct"  # stdout is the % ; absent => coverage skipped+warn
  lint:        { required: true,  on_fail: halt,     command: "npm run lint" }
  architecture:{ required: false, on_fail: advisory, command: "npm run arch:check" }
  security:    { required: false, on_fail: advisory, command: "npm run audit" }
```

Unknown keys at `quality_gates:` level are silently dropped (forward-compat), mirroring
`parseHooksBlock`'s key filtering against `KNOWN_GATES`.

## Interfaces / Contracts

```js
// scripts/lib/quality-gates.js  (pure, zero I/O — mirrors lifecycle-hooks.js)
const KNOWN_GATES            = ["tests", "lint", "architecture", "security"];
const KNOWN_ON_FAIL         = ["advisory", "halt"];
const DEFAULT_GATE_TIMEOUT_MS = 120000;   // H5 — default per-gate execution budget

parseQualityGates(rawPolicy)   // obj|null|undefined -> normalized policy | null (absent => no-op)
                               //   coerces coverage.minimum to Number, drops when not finite in [0,100] (H6)
                               //   parses optional per-gate timeout_ms (positive int; default DEFAULT_GATE_TIMEOUT_MS) (H5)
validateQualityGates(policy)   // -> { valid, errors[] }  advisory only, never throws
                               //   emits error for invalid coverage.minimum and non-positive timeout_ms (H5/H6)
parseCoverage(stdout)          // string -> number in [0,100] | null (malformed OR out-of-range => null) (H6)
classifyCoverage(cfg, execResult) // pure helper extracted from classifyGate (readability) ->
                               //   { override?: 'fail', detail? }  coverage sub-check only
classifyGate(name, cfg, execResult) // execResult = { exitCode, coverageStdout?, error?, timedOut? }
                               //   -> { status: 'pass'|'fail'|'skipped'|'error', detail? }
enforceGate(name, cfg, result) // -> { finding: 'BLOCKER'|'WARNING'|null, blocksArchive }
aggregateStatus(gateResults)   // -> 'pass' | 'fail' | 'skipped'  ([] => 'skipped')
buildAuditBlock(results, evaluatedAt) // -> state.yaml gates.quality-gates object (status always explicit)
```

`classifyGate` rules (H4 precedence): empty command → `skipped`; `execResult.timedOut` →
`error` (detail `"command timed out after Nms"`); `execResult.error != null` OR `exitCode`
not a finite number → `error` (detail `"command failed to execute: …"`); exitCode 0 →
`pass`; non-zero → `fail`. For `tests`, after the base status, `classifyCoverage` applies
the coverage sub-check only when `coverage.minimum` is a number and `coverage.command` is
present: parse `coverageStdout` → `< minimum` forces `fail` (detail `"coverage N% < minimum
M%"`); `parseCoverage` returns `null` (malformed OR out-of-range) → coverage-skipped warning
(no fail); absent `coverage.command` or omitted/invalid `minimum` → coverage skipped with
warning (no fail).

`enforceGate` mapping (when `status: fail` OR `status: error` — H4): `required && on_fail==halt`
→ BLOCKER + `blocksArchive:true`; `required && on_fail==advisory` → WARNING; `required:false`
→ no finding. `aggregateStatus`: any halt-required `fail`/`error` → `fail`; else if any
`pass`/`skipped` → `pass`; all skipped (and empty array) → `skipped`. A per-gate `status:
error` is preserved verbatim in the audit block so it stays distinct from a genuine `fail`.

## Data Flow

```
config.yaml ──read──► sdd-verify (agent / effect layer)
                          │  parseQualityGates() ─► null? => NO-OP, no audit
                          │  for each gate: execute(command) ─► {exitCode, stdout}
                          │  classifyGate(name,cfg,exec)  (ALL gates before enforcement)
                          │  enforceGate(...) ─► findings  ; aggregateStatus(...)
                          ▼
            verify-report.md (gate table + findings)  +  state.yaml gates.quality-gates
                          │
            orchestrator reads state.yaml.gates.quality-gates.status
              fail ─► block archive ─► ask user ─► override(justification)?
                          └─► write override to state.yaml + verify-report.md ─► dispatch sdd-archive
              pass/skipped/absent ─► dispatch sdd-archive normally
```

### Sequence: verify → gate-eval → audit → archive-block / override

```
User        Orchestrator        sdd-verify          quality-gates.js      execute
 │   /verify     │                   │                     │                │
 │──────────────►│──── dispatch ────►│                     │                │
 │               │                   │ parseQualityGates ──►│ (normalize)    │
 │               │                   │◄─── policy|null ─────│                │
 │               │                   │ per gate: command ──────────────────►│
 │               │                   │◄──────── {exitCode, stdout} ─────────│
 │               │                   │ classifyGate/enforce►│                │
 │               │                   │◄── results+findings ─│                │
 │               │                   │ aggregateStatus +    │                │
 │               │                   │ buildAuditBlock ────►│                │
 │               │   write verify-report.md + state.yaml    │                │
 │               │◄── envelope (PASS|PASS w/WARN|FAIL) ─────│                │
 │               │ read state.yaml.gates.quality-gates.status               │
 │               │   status==fail → ask (fix | override+justification)      │
 │◄── question ──│                   │                     │                │
 │── justify ───►│ write override → state.yaml + verify-report.md           │
 │               │──── dispatch sdd-archive ───►                            │
```

## Audit Shape

`verify-report.md` gains a "Quality Gates" table: `gate | status | required | on_fail |
detail`, plus an optional `## Override` section (timestamp + verbatim justification).
`state.yaml.gates.quality-gates` matches the routing spec block exactly: top-level
`status`/`evaluated_at`, optional `override {timestamp, justification}`, and per-gate
`gates.{name} {status, required, on_fail, detail?}`. Block is a sibling of `gates:`
sub-keys (same level as `clarify`, `4r-review-gate`). Written only when policy present.

## Effect-Layer Hardening (4R remediation)

The 4R review gate raised 1 CRITICAL (resilience) plus convergent WARNINGs (risk W2,
reliability). This cycle hardens the pure/effect boundary **without relitigating** the three
authoritative clarify decisions (`clarify-on-fail-default`, `clarify-coverage-measurement`,
`clarify-archive-override`). All decisions below are additive.

### Decision H1: Audit write is fail-closed — verify never returns success on a partial write (CRITICAL + W2)

**Choice**: When `parseQualityGates` returns a non-null policy, the `gates.quality-gates`
block is mandatory. `sdd-verify` MUST (1) build the full audit block in memory with an
explicit top-level `status`; (2) write it to `state.yaml`; (3) read it back and confirm
`gates.quality-gates.status` persisted; (4) if the write throws OR read-back fails, set
best-effort `gates.quality-gates.status: error` (sentinel) and return envelope
`status: blocked` (NOT `success`) with a `question_gate`. A declared policy can therefore
never silently degrade to "absent".

**Alternatives considered**: keep `status: success` and rely solely on the orchestrator guard.
**Rationale**: The CRITICAL is a fail-open — a swallowed write error plus `status: success`
lets the orchestrator read the key as absent and dispatch archive past a real halt gate.
Tying the success envelope to a *verified* write closes it at the source; the `error`
sentinel + read-back makes a partial write detectable instead of indistinguishable from
"no policy declared".

### Decision H2: Orchestrator archive guard is policy-aware (CRITICAL defense-in-depth)

**Choice**: Before archive, the guard reads BOTH `openspec/config.yaml` `quality_gates:` (via
`parseQualityGates`) and `state.yaml.gates.quality-gates`. It BLOCKS archive when ANY of:
block present with `status ∈ {fail, error}`; OR policy declared
(`parseQualityGates(...) !== null`) but the block is absent/unparseable; OR verify returned a
non-success envelope. It PROCEEDS only when policy is absent (`null` → true no-op) OR the
block status is `pass`/`skipped`.

**Rationale**: "Absent" is now disambiguated — absent + no policy = legitimate no-op;
absent + declared policy = anomaly (write failure / verify bug) → conservative block. This is
independent of H1, so no single point of failure can bypass a required halt gate.

### Decision H3: Override requires BOTH audit destinations before dispatch (W2)

**Choice**: Archive may proceed past a blocking gate ONLY when BOTH
`state.yaml.gates.quality-gates.override {timestamp, justification}` AND the `## Override`
section in `verify-report.md` are present. The orchestrator writes the state.yaml override →
the verify-report `## Override` section → re-reads both → dispatches only if both are
confirmed. If only one is present the override is incomplete → do NOT dispatch; repair or
re-prompt.

**Rationale**: Closes W2 — the previous guard read only `state.yaml` status and could dispatch
on a half-written override. Requiring both destinations preserves the
`clarify-archive-override` two-place audit guarantee under partial-write conditions.

### Decision H4: Distinct `error` classification for gate-command tool failures (WARNING)

**Choice**: `classifyGate` gains an `error` status. The agent passes
`execResult = { exitCode, coverageStdout?, error?, timedOut? }`. Precedence: empty command →
`skipped`; `timedOut` → `error`; `error != null` OR `exitCode` not a finite number → `error`;
`exitCode === 0` → `pass`; non-zero → `fail`. `enforceGate` applies the same severity matrix
to `error` as to `fail`. `aggregateStatus` treats a required-halt `error` as blocking
(top-level `fail`); the per-gate `status: error` + detail keeps it distinct in the audit.

**Rationale**: Today `exec.exitCode === 0` with an `undefined` exitCode silently yields `fail`,
conflating a real quality fail with a tool error (ENOENT, permission denied). A required-halt
gate whose command cannot even run must neither be reported as a quality fail nor silently
pass; `error` is auditable and conservatively blocking.

### Decision H5: Bounded gate execution with timeout/abort (WARNING)

**Choice**: Each gate `command` and `coverage.command` is executed by the agent with a
bounded timeout. The schema gains an optional per-gate `timeout_ms` (positive integer;
default module constant `DEFAULT_GATE_TIMEOUT_MS = 120000`). On timeout the agent aborts the
process and passes `execResult.timedOut = true`; `classifyGate` returns `error` with detail
`"command timed out after {ms}ms"`. The abort itself is agent I/O (prose contract); the
default/override parsing and the timed-out classification are pure.

**Rationale**: A hung command currently freezes verify indefinitely. A bounded, audited abort
keeps the phase live and records the timeout distinctly from a quality fail.

### Decision H6: Validate/normalize `coverage.minimum`; range-validate `parseCoverage` (WARNING)

**Choice**: `parseQualityGates` coerces `coverage.minimum` with `Number()`, keeps it only when
finite in [0,100], otherwise OMITS it (coverage sub-check disabled). `validateQualityGates`
emits an advisory error `tests.coverage.minimum invalid (must be a number in [0,100])` for any
present-but-invalid value; the agent surfaces validation errors in the `## Quality Gates`
report section so disablement is never silent. `parseCoverage` range-validates: a parsed value
outside [0,100] returns `null` (→ coverage-skipped-with-warning), it does NOT clamp.

**Alternatives considered**: clamp `>100 → 100`.
**Rationale**: `pct < NaN` is always false, so a non-numeric `minimum` ("80%") silently
disables the gate (fail-open). Coercion + a visible validation error removes the silence.
Clamping `150 → 100` was rejected because it still yields a false *pass*; validate-to-null
turns an out-of-range reading into a visible skip, never a pass.

### Decision H7: Gate command trust boundary & credential hygiene (WARNING)

**Choice**: Document — mirroring the lifecycle-hooks `run-command` trust boundary in
`sdd-orchestrator.agent.md` — that gate `command`/`coverage.command` strings are executed with
full privilege via `sdd-verify`'s `execute` tool, flow through the existing `PreToolUse`
DENY/ASK evaluation unchanged, and live in committable config. Operators MUST treat them as
trusted, version-controlled configuration and MUST NOT embed secrets, tokens, or credentials
inline (both `openspec/config.yaml` and `verify-report.md` are committable; PR review MUST
scrutinize gate commands). Use environment variables or secret-manager references resolved at
runtime, not inline literals.

**Rationale**: Quality-gate commands are the highest-trust field in the new schema; without an
explicit boundary note an operator could inline a credential into a committable artifact.

### Readability (apply implements; noted here per rules.design)

- Extract a pure `classifyCoverage(cfg, execResult)` helper from `classifyGate` so coverage
  handling stays under 3 nesting levels.
- Remove the stale `"until Phase 2 is implemented"` test comment.
- Rename the ambiguous `exec` parameter to `execResult`.
- Document the intentional naming asymmetry: the **config** key is snake_case `quality_gates:`
  (YAML config convention), while the **state** gate name is kebab-case `gates.quality-gates`
  (matches sibling gate names `clarify`, `4r-review-gate`). Add this note to
  `skills/_shared/openspec-convention.md` and the `quality-gates.js` module header.

### Sequence: failed-write / policy-aware guard / two-place override

```
sdd-verify (effect layer)                       Orchestrator archive guard
──────────────────────────                      ────────────────────────────
parseQualityGates(config) = policy
  policy == null ───────────────────────────►   no-op: dispatch archive normally
  policy != null:
    run gates (bounded timeout_ms, H5)
      └► classifyGate ─► pass | fail | skipped | error   (H4)
    buildAuditBlock (status ALWAYS explicit, H1)
    write state.yaml.gates.quality-gates
    read-back status
      write OK ──► envelope status: success ───►  guard reads config + state.yaml
      write FAIL ─► best-effort status: error
                   envelope status: BLOCKED ───►  guard sees non-success ─► BLOCK

Guard decision (policyDeclared = parseQualityGates(config) != null):   (H2)
  policyDeclared && block absent/unparseable ─────────────► BLOCK (anomaly)
  status ∈ {fail, error} ─────────────────────────────────► BLOCK
  envelope non-success ───────────────────────────────────► BLOCK
  !policyDeclared (null) OR status ∈ {pass, skipped} ─────► DISPATCH archive

On BLOCK → ask user (fix | override):                                  (H3)
  override chosen:
    write state.yaml gates.quality-gates.override {ts, justification}
    write verify-report.md ## Override {ts, justification}
    re-read BOTH destinations
      both present ──► dispatch archive
      only one ─────► incomplete override ─► do NOT dispatch; repair / re-prompt
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/quality-gates.js` | Modify | Add `error` status + `classifyCoverage` helper (H4); `execResult` rename + tool-failure/timeout precedence (H4/H5); `DEFAULT_GATE_TIMEOUT_MS` + `timeout_ms` parse/validate (H5); coerce/range-validate `coverage.minimum` (H6); range-validate `parseCoverage` (H6); module-header note on `quality_gates` vs `quality-gates` naming |
| `scripts/lib/quality-gates.test.js` | Modify | Add NEW failing-first unit tests (see Testing Strategy); remove stale `"until Phase 2"` comment |
| `openspec/config.yaml` | Modify | Document optional `quality_gates:` schema incl. `timeout_ms` + trust-boundary/credential-hygiene comment (H7) |
| `skills/sdd-verify/SKILL.md` | Modify | Step 9a: bounded-timeout execution (H5), `error`/timeout audit, surface validation errors (H6), fail-closed audit write + read-back + `status: blocked` on write failure (H1) |
| `agents/sdd-verify.agent.md` | Modify | Quality Gate Evaluation Contract: timeout/abort + `execResult` fields (H4/H5); fail-closed write + read-back, envelope `blocked` on write failure (H1); gate-command trust boundary + credential hygiene (H7) |
| `agents/sdd-orchestrator.agent.md` | Modify | Archive Dispatch Guard: policy-aware block on absent-but-declared + `error` + non-success envelope (H2); two-place override check (state.yaml override AND verify-report `## Override`) before dispatch (H3) |
| `skills/_shared/openspec-convention.md` | Modify | Document `gates.quality-gates` audit block + override sub-block; `error` status value; `quality_gates`/`quality-gates` naming-asymmetry note |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (`quality-gates.test.js`) — existing | `parseQualityGates` defaults/unknown-key drop/absent→null; `validateQualityGates` advisory errors + never-throw; `parseCoverage` valid/malformed/null; `classifyGate` pass/fail/skipped + coverage-below + coverage-skipped; `enforceGate` BLOCKER/WARNING/none matrix; `aggregateStatus` fail/pass/skipped; `buildAuditBlock` shape | Node native `--test`, table-driven, TDD: write failing test per behavior first |
| Unit — **NEW (4R remediation, failing-first)** | (1) `validateQualityGates` rejects non-numeric/out-of-range `coverage.minimum` (`"80%"`, `-1`, `101`) and non-positive `timeout_ms` (H6/H5); (2) `parseQualityGates` coerces valid minimum to number and OMITS invalid minimum (H6); (3) `parseCoverage` range/clamp: `"150"→null`, `"-5"→null`, `"0"→0`, `"100"→100`, `"79.5"→79.5` (H6); (4) `parseCoverage(undefined)→null`; (5) `aggregateStatus([])→'skipped'`; (6) `buildAuditBlock([], ts)→{status:'skipped', evaluated_at:ts, gates:{}}`; (7) `parseQualityGates` malformed inputs (array, string, number, `null`, gate value non-object) → `null` or safe normalization; (8) gate `error`/timeout classification — `classifyGate` with `execResult.timedOut`, `execResult.error`, and `exitCode` undefined/NaN → `status:'error'` (+ detail); (9) `classifyCoverage(cfg, execResult)` helper in isolation (below-min fail, malformed→skip, out-of-range→skip, no command→skip); (10) `enforceGate` + `aggregateStatus` treat required-halt `error` as blocking | Node native `--test`, table-driven, TDD: each behavior gets a failing test before the implementation change |
| Agent-contract (prose, inspection-verified) | H1 fail-closed write (build-explicit-status → write → read-back → `blocked` envelope on failure); H4/H5 bounded-timeout execution + `error`/timeout audit; H6 surface validation errors in `## Quality Gates`; H7 gate-command trust boundary/credential hygiene; runs ALL gates before enforcement; no-op when policy absent | `sdd-verify` SKILL/agent steps; verified by sdd-verify phase inspection-proof, not unit tests |
| Orchestrator-contract (prose, inspection-verified) | H2 policy-aware guard (block on absent-but-declared, `fail`, `error`, non-success envelope); H3 two-place override check (state.yaml override AND verify-report `## Override`) before dispatch | `sdd-orchestrator` doc; verified by inspection-proof |

TDD note (Strict TDD active): every pure-layer remediation (H4 classification, H5 timeout
parse/classify, H6 coverage validation/range) gets a failing unit test before the
implementation change; `npm test` must stay green. The effect-layer remediations (H1 write
read-back, H2 policy-aware guard, H3 two-place override, H5 abort, H7 trust boundary) are
**prose contracts** in the SKILL/agent docs — I/O that cannot be unit-tested, verified by
inspection-proof at the sdd-verify phase (matching the route-dispatcher/lifecycle-hooks
boundary).

## Migration / Rollout

Additive. `quality_gates.tests.coverage.minimum` supersedes
`rules.verify.coverage_threshold` ONLY when `quality_gates:` is declared; when absent the
legacy field stays active. No data migration. Rollback = revert the lib + doc/skill
edits; an empty/absent policy reproduces today's verify behavior exactly.

## Open Questions

- None. The three original blocking decisions remain resolved in `state.yaml.approvals` and
  the spec Clarifications and are authoritative (not relitigated). The 4R remediation
  decisions (H1–H7) are derivable hardening of the existing pure/effect boundary and need no
  new user decision; they are recorded above with rationale.
