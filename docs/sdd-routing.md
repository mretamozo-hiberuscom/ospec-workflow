# SDD Routing

The SDD orchestrator selects a **route** for every change. A route is a named combination of phases and gates that maps to a specific user intent. Routes are declared in `openspec/config.yaml::routing` and evaluated top-to-bottom; the **first matching route wins**.

## Route, Phase, and Gate — Distinctions

| Concept | What it is | Examples |
|---------|-----------|---------|
| **Route** | A named workflow profile: ordered phases + hook-point gates. Represents a distinct user intent. | `standard`, `lite`, `debug`, `brownfield`, `foundation`, `federated` |
| **Phase** | A delegated SDD sub-agent that produces a single artifact. Phases run in declared order inside a route. | `sdd-propose`, `sdd-apply`, `sdd-verify` |
| **Gate** | A check or advisory that runs at a specific hook point within a route. Does NOT produce a main artifact; records its outcome in `state.yaml.gates`. | `clarify`, `4r-review-gate`, `brownfield-advisory` |

A route is a **distinct user intent**, not an implementation detail. Do not add a route because a phase needs a configuration toggle — use a gate or a phase option instead.

## The Six Routes (first-match-wins order)

| # | Name | Classification | Key Conditions | Phases | Gates | Cost |
|---|------|----------------|----------------|--------|-------|------|
| 1 | `foundation` | normal, high-risk | `project.status: empty` OR `architecture: none-detected` | `[sdd-foundation]` | `[]` | medium |
| 2 | `federated` | normal, high-risk | `artifact_store.backend: workspace-federated` | `[sdd-workspace, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[impact, clarify]` | high |
| 3 | `debug` | small, normal | Explicit debug intent only (never auto-routed) | `[sdd-explore, sdd-apply]` | `[4r-review-gate]` | low |
| 4 | `brownfield` | normal, high-risk | `baseline.status: pending` OR empty specs with code present | `[sdd-baseline]` | `[brownfield-advisory]` | medium |
| 5 | `standard` | normal, high-risk | `project.status: active`; classification normal/high-risk | `[sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[clarify, 4r-review-gate]` | high |
| 6 | `lite` | trivial, small | classification trivial/small | `[sdd-propose, sdd-tasks, sdd-apply, sdd-verify]` | `[]` | low |

Notes:
- **foundation** stops after `sdd-foundation` and hands back. It does NOT auto-chain into standard SDD.
- **debug** is explicit-only: the user MUST signal debug intent ("debug this", "add logs", "quick fix"). The orchestrator MUST NOT auto-route from classification signals alone.
- **brownfield** is an advisory preface: the `brownfield-advisory` gate runs first; `sdd-baseline` runs only on user consent. Then re-routes to the underlying change route.
- **standard** lists `4r-review-gate` in `gates` to ENABLE optional 4R after a successful `sdd-verify`; removing it disables 4R.
- **lite** omits `clarify`; the gate is SKIPPED when route=lite AND class∈{trivial,small} AND no `residual_ambiguity` from `sdd-spec`.

## Conditions Evaluation Order

The orchestrator walks the route table from top (#1) to bottom (#6). The first route whose `conditions` block is fully satisfied by the current context is selected. No further routes are evaluated.

Deterministic signals (no user prompt needed):
- `classification` — explicit value from the user or change meta
- `project.status` — from `openspec/config.yaml`
- `baseline.status` — from `openspec/config.yaml`
- `artifact_store.backend` — from `openspec/config.yaml`

Advisory signals (require `vscode/askQuestions` before routing):
- Any signal that requires intent inference (e.g., "debug this" without explicit `debug` classification)

The validator function `classifyChange(ctx)` returns `{ classification, confidence }` where `confidence` is `'deterministic'` or `'advisory'`.

## 4R Gate Hook Points

The `4r-review-gate` dispatches four read-only reviewer sub-agents (risk, readability, reliability, resilience). It runs at different points depending on the route:

| Route | Hook point | What happens after |
|-------|-----------|-------------------|
| `debug` | After `sdd-apply` completes | Route closes; no `sdd-verify` |
| `standard` | After `sdd-verify` returns `success` (when `gates` includes `4r-review-gate`) | Route closes; archive proceeds |

A `BLOCKER` or `CRITICAL` finding MUST be surfaced to the user via `vscode/askQuestions` before the route closes. The gate is **advisory-only** by default: it does NOT auto-halt route execution. The policy is `on_blocker: advisory`; a future `gate_policy.4r.on_blocker: halt` config field can change this without code changes.

## Supported `parseRoutingTable` YAML Subset

The `routing:` block parser (`scripts/lib/route-dispatcher.js::parseRoutingTable`) supports a constrained subset of YAML. Authors MUST stay within this subset.

### Supported constructs

**Scalar fields** (string values):
```yaml
    name: standard
    description: "Full SDD for normal/high-risk changes."
    cost: high
```

**Inline arrays** (phases, gates, classification, tags):
```yaml
    phases: [sdd-propose, sdd-spec, sdd-apply]
    gates: [clarify, 4r-review-gate]
    classification: [normal, high-risk]
    gates: []
```

**Block sequences** (alternative to inline arrays):
```yaml
    phases:
      - sdd-propose
      - sdd-spec
      - sdd-apply
```

**Nested `conditions:` map** (key-value pairs, keys may contain dots):
```yaml
    conditions:
      project.status: active
      artifact_store.backend: openspec
```

**Comments and blank lines** — ignored anywhere in the block:
```yaml
  # This is a comment — ignored by the parser
  - name: standard

    classification: normal   # trailing comment — ignored
```

### NOT supported (will be silently ignored or cause unexpected parse results)

- Multi-line scalar values (`|` and `>` block scalars)
- Nested sequences inside `conditions:`
- Anchors and aliases (`&anchor`, `*alias`)
- Boolean values as scalars (`true`/`false` are parsed as strings)
- Numeric values (parsed as strings)
- General YAML multi-document (`---`)

## Dumping-Ground Criteria

A route MUST represent a **distinct user intent**, not an implementation detail or a configuration variant.

Valid reason to add a route:
- The intent has a fundamentally different phase set (e.g., `debug` skips spec/design entirely)
- The intent has a different risk/cost profile that affects gate selection
- The intent has a specific trigger condition that meaningfully changes the workflow

Invalid reasons:
- A phase needs a slightly different configuration flag
- You want to skip one optional phase for a subset of changes (use a gate condition instead)
- Two routes would have identical phase/gate lists with only different conditions

The six routes defined in v1 were designed to cover all real workflow intents without overlap.
