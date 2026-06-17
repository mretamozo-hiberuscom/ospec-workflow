# Design: Federation Distributed Markers (C1 — mechanism + workspace-explore)

## Technical Approach

C1 inverts the federation source-of-truth contract incrementally and **additively**, so
the existing tested behavior of `workspace-atlas.js` and `artifact-store.js` keeps passing
untouched. The distributed canonical marker `openspec/federation.member.yaml` (D4/D5)
becomes the truth; `openspec/workspace.yaml` is demoted to a derived, gitignored,
regenerable cache (D6). The inversion is realized at the store boundary by adding a
**regeneration branch** to `loadAtlas()` that fires only when the cache is missing or
corrupt — the valid-cache happy path (which every current federated test exercises) is
preserved as legitimate cache semantics. New pure functions (marker reader, merger,
serializer, member scan) are added beside the untouched `parseAtlas`. `enroll` lives in a
new write-only module. `sdd-init` gains `.git` container detection + the `target_dir`
parameter; `sdd-workspace` gains `enroll` and an `explore`/`classify` subcommand that
realizes the `workspace-explore` phase. Maps every MUST scenario in the four change-local
specs to a concrete component below.

## Architecture Decisions

### Decision: Invert via an additive regeneration branch, not a rewrite of `loadAtlas`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Always rebuild atlas from markers on every load | Pure inversion, but breaks all 6 federated `artifact-store.test.js` cases (they ship a cache, no markers) and re-scans on every hook call | Rejected |
| Trust a valid cache; regenerate from markers only on ENOENT/parse-failure | Correct derived-cache semantics; zero edits to existing tests; satisfies "handle missing/corrupt by regenerating" | **Chosen** |

**Rationale**: This is the HIGH risk. A derived cache is meant to be trusted when valid and
rebuilt when stale/missing; `workspace-explore` is responsible for refreshing it after
`enroll`. Keeping the happy path means **no existing test is refactored** — the strongest
possible regression guard. `parseAtlas` is kept verbatim for cache deserialization (proposal
risk mitigation). Satisfies `Atlas absent`, `Atlas corrupt`, `Atlas gitignored` scenarios.

### Decision: Marker read/merge in `workspace-atlas.js`; marker WRITE (`enroll`) in a new module

**Choice**: Add `loadMarkerFromMember`, `scanMemberMarkers`, `mergeMarkersIntoAtlas`,
`serializeAtlas` to `workspace-atlas.js` (read/aggregate path, consumed by hooks). Create
`scripts/lib/federation-marker.js` for `parseMarker`, `serializeMarker`, `enroll`
(member-repo write path).
**Alternatives considered**: Put `enroll` in `workspace-atlas.js` too.
**Rationale**: Separation of concerns — the atlas module is the read-only aggregation surface
the hooks depend on; member-repo writes (atomic rename, idempotency, timestamp policy) are a
distinct, higher-risk concern. Keeping writes out of the read path keeps the hook-facing
module side-effect-free. (Additive file beyond the proposal's enumerated areas; low risk.)

### Decision: Idempotent `enroll` via content-minus-timestamp comparison (amb-4)

**Choice**: `enroll` serializes the candidate with `updated_at` stripped, parses the existing
marker and strips its `updated_at`, and compares the two normalized forms. If equal → no
write, existing `updated_at` preserved (byte-stable). If different → set `updated_at = now`,
serialize, write atomically (temp + rename, mirroring `writeSessionSummary`).
**Rationale**: Prevents phantom timestamp advances that would falsely trigger latest-wins in
the merge. Satisfies the idempotency scenarios in `federation-markers` and `skills` specs.

### Decision: Merge = union + latest-wins + lexicographic-ascending tiebreak, fail-open (amb-1)

**Choice**: `mergeMarkersIntoAtlas(markers)` unions all roster/member entries; on duplicate
`member.id`, the later `updated_at` wins; on equal `updated_at`, the entry sourced from the
lexicographically **greater** source `member.id` wins (`svc-web` > `svc-api`), emitting a tie
warning. A marker that fails to parse is skipped with a warning and never aborts the merge.
**Rationale**: Deterministic, stateless, OS-independent (amb-1, fixed). Satisfies the three
`Atlas Merge Semantics` scenarios.

### Decision: `workspace-explore` realized as a new `sdd-workspace explore` subcommand

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Standalone phase: new `skills/workspace-explore/SKILL.md` + 4-target agents | Faithful to the name, but proliferates agent files across claude/vscode/github-copilot/opencode and duplicates federation front-door wiring | Rejected for C1 |
| New `explore`/`classify` subcommand on `sdd-workspace` | Reuses the federation front door (already owns `init`/`status`/`impact`, now `enroll`); single skill edit; orchestrator already routes here | **Chosen** |

**Rationale**: No D1–D11 decision mandates a separate agent; D7 already places `enroll` in
`sdd-workspace`, and explore's only writes are markers (via `enroll`) + cache + map. Folding
it in keeps the four-target generator surface stable.

### Decision: `target_dir` via `## Parameters` prompt block; resumable lot via filesystem-derived state (amb-2, D8/D9)

**Choice**: `sdd-init` reads `target_dir` from a `## Parameters` block in the launch prompt
(same pattern as `## Project Standards`), no env var, no dynamic frontmatter. Missing path →
`blocked` + `question_gate`. The bootstrap lot is NOT a separate state file: done/pending is
derived from the filesystem (`initialized` = `openspec/config.yaml` present; `pending` =
marker present, no config) plus per-member rows in `workspace-map.md`. Idempotent `enroll`
makes re-running explore skip unchanged members and retry failed ones.
**Rationale**: amb-2 fixed the propagation mechanism; D8/D9 make state derivable, so no extra
persisted lot artifact is needed. Resumability falls out of idempotency + derived state.

## Data Flow

    sdd-init (target_dir | cwd)
       │ depth-1 scan: own .git? children with .git?
       ├─ container (0 own .git, ≥2 child .git) ─→ status: blocked + question_gate(federated|normal)
       └─ normal ─→ standard init

    sdd-workspace explore (container)
       scan children(depth 1) ─→ classify(type,layer,brownfield,init-done)
            │
            └─→ enroll(member) ─→ {member}/openspec/federation.member.yaml   [federation-marker.js]
                       │
       after all enrolls ─→ scanMemberMarkers ─→ mergeMarkersIntoAtlas ─→ serializeAtlas
                       │                                                      │
                       ├─→ openspec/workspace.yaml (derived cache, gitignored)
                       └─→ openspec/workspace-map.md (human-readable, all members + warnings)

    hooks ─→ artifact-store.loadAtlas()
                valid cache? ─yes→ parseAtlas (unchanged path; warn if git-tracked)
                            └─no/corrupt→ regenerate from markers ─→ write cache

### Sequence: sdd-init federated bridge

    Orchestrator        sdd-init            FS
        │  launch + ## Parameters{target_dir} │
        │ ───────────────────────────────────▶│
        │                  resolve base (target_dir|cwd)
        │                  stat(base) ────────▶│
        │                  ENOENT? ◀───────────│ (target_dir missing)
        │  blocked + question_gate(invalid path)│
        │ ◀────────────────────────────────────│
        │                  depth-1 .git scan ─▶│
        │                  own .git? children≥2 with .git?
        │  container → blocked + question_gate(federated|normal)  [no writes]
        │ ◀────────────────────────────────────│
        │  single-repo → standard init + write artifacts
        │ ◀────────────────────────────────────│

### Sequence: enroll + atlas regeneration loop

    Orchestrator     sdd-workspace explore     federation-marker     workspace-atlas       FS
        │ explore(container) ─▶│                      │                    │                │
        │            for each member: classify        │                    │                │
        │                      │ enroll(dir,data) ───▶│                    │                │
        │                      │            read existing marker ──────────────────────────▶│
        │                      │            strip updated_at, compare normalized forms       │
        │                      │            identical? → return (no write, stable)           │
        │                      │            changed?   → updated_at=now, atomic write ──────▶│
        │                      │ ok/pending ◀─────────│                    │                │
        │            after all: scanMemberMarkers ───────────────────────▶│ read markers ─▶│
        │                      │            mergeMarkersIntoAtlas (union+latest-wins+tiebreak, fail-open)
        │                      │            serializeAtlas ───────────────▶│ write cache ──▶│
        │                      │            write workspace-map.md ─────────────────────────▶│
        │ success + artifacts ◀│                      │                    │                │

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/workspace-atlas.js` | Modify | ADD `loadMarkerFromMember`, `scanMemberMarkers` (depth-1 child scan for `openspec/federation.member.yaml`), `mergeMarkersIntoAtlas` (union+latest-wins+amb-1 tiebreak+fail-open), `serializeAtlas` (cache writer). `parseAtlas`/`resolveMembers`/`computeImpact` UNTOUCHED. |
| `scripts/lib/artifact-store.js` | Modify | `createWorkspaceFederatedStore.loadAtlas()` adds a regeneration branch on ENOENT/parse-failure (scan markers → merge → write cache); valid-cache path preserved. Add warn-on-detect `git ls-files openspec/workspace.yaml` (fail-open if git absent). |
| `scripts/lib/federation-marker.js` | Create | NEW write-only module: `parseMarker`, `serializeMarker`, `enroll(memberDir, data)` (idempotent, byte-stable, atomic temp+rename). |
| `scripts/lib/workspace-atlas.test.js` | Modify | ADD tests for the four new functions; existing assertions kept. |
| `scripts/lib/artifact-store.test.js` | Modify | ADD regeneration/corrupt-cache/git-tracked-warning tests; existing federated tests kept. |
| `scripts/lib/federation-marker.test.js` | Create | NEW: enroll first-write, idempotent no-refresh, change-refresh; marker parse/serialize round-trip. |
| `skills/sdd-init/SKILL.md` | Modify | Multirepo container detection gate (≥2 child `.git`, no own `.git`) → blocked+question_gate; `target_dir` resolution from `## Parameters`; missing-path → blocked. |
| `agents/sdd-init.agent.md` | Modify | Document `target_dir` parameter contract (`## Parameters` block). |
| `skills/sdd-workspace/SKILL.md` | Modify | Add `enroll` operation (relax read-only per D7) and `explore`/`classify` subcommand (discovery, classification, 3 artifacts). |
| `agents/sdd-workspace.agent.md` | Modify | Add `enroll`/`explore` to subcommand list; note orchestrator-only `enroll`. |
| `agents/sdd-orchestrator.agent.md` | Modify | Workspace Federation section: note markers-as-truth, explore front door, D11 coordinator repo as a future interface (note only, not designed). |
| `skills/_shared/persistence-contract.md` | Modify | Document atlas-as-derived-cache inversion + marker truth. |
| `.gitignore` | Modify | Add `openspec/workspace.yaml`. |

> Cross-cutting note: agent files are generated for 4 targets (claude/vscode/github-copilot/opencode); source edits live in `agents/*.agent.md` and `skills/**`, regenerated by the existing generator. No new top-level phase agent is introduced.

## Interfaces / Contracts

```js
// scripts/lib/workspace-atlas.js (additions)
async function loadMarkerFromMember(memberRoot) // → { ok, marker } | { ok:false, warning }
async function scanMemberMarkers(containerRoot) // depth-1 → [{ memberDir, marker|error }]
function mergeMarkersIntoAtlas(markers)         // → { atlas:{members,contracts}, warnings:[] }
function serializeAtlas(atlas)                  // → yaml string (parseAtlas-compatible subset)

// scripts/lib/federation-marker.js (new)
function parseMarker(content)                   // dependency-free YAML subset → object
function serializeMarker(data)                  // object → canonical yaml string
async function enroll(memberDir, data)          // → { status:'written'|'fresh', path, updated_at }
```

```yaml
# openspec/federation.member.yaml (D5 canonical marker)
federation: { id: <unique-across-roster> }
member:
  id: <member-id>
  role: primary | secondary
  type: microservicio | microfrontal | nuget
  layer: dominio | common
  remote: <url>            # SHOULD; MAY be absent (fail-open warning)
  provides:                # object[]: provider declares its contracts AND consumers
    - { id: <contract-id>, consumers: [<member-id>], surface: <tag> }
roster:
  - { id: <member-id>, remote: <url> }
updated_at: <ISO-8601>     # merge timestamp; refreshed only on content change
```

> Marker→atlas mapping note: `provides[]` are objects `{ id, consumers[], surface }`, so the
> atlas reconstructs full contract edges (`{ id, provider: member.id, consumers }`). The
> `impact` set of a provider = provider + the union of its declared `consumers`. The
> cross-repo contract graph IS fully reconstructable from markers in C1 (schema extended
> 2026-06-17; see `federation-markers/spec.md` Clarifications). Operational caveat: a new
> consumer that appears without re-enrolling the provider leaves the provider's graph stale
> until the next `enroll`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | merge union/latest-wins/equal-ts tiebreak/fail-open; marker parse/serialize round-trip; `enroll` first-write/idempotent-no-refresh/change-refresh; `serializeAtlas`↔`parseAtlas` round-trip | New `node --test` cases; TDD-first (red before green) |
| Unit | `loadAtlas` regeneration on absent/corrupt cache; warn-on-detect git-tracked | New cases in `artifact-store.test.js`; tmp workspace fixtures with markers |
| Regression | All current `workspace-atlas.test.js` + 6 federated `artifact-store.test.js` cases unchanged | Run untouched; green-before-and-after proves additive inversion |
| Integration | explore: 3-artifacts-on-success, partial-enroll-failure → member `pending` in map, cache from succeeded only | tmp container with child `.git` fixtures |

Regression-avoidance during inversion: (1) keep `parseAtlas` byte-identical; (2) add the
regeneration branch only on the error path; (3) write new tests RED first, then implement.

## Migration / Rollout

Warn-on-detect only (amb-3): `loadAtlas` runs `git ls-files openspec/workspace.yaml`; if
tracked, emit a warning to run `git rm --cached openspec/workspace.yaml` manually. C1
NEVER runs a destructive git op. `.gitignore` gains the cache rule. Single-PR rollback =
revert the merge commit; the only out-of-repo side effect is markers written via `enroll`
(cleanup note: delete each member's `openspec/federation.member.yaml`, un-gitignore the cache).

## Slicing (delivery: single-pr, high-risk)

Divisible into dependency-ordered work units for the `sdd-tasks` forecast:

1. **WU1** — `workspace-atlas.js` marker read/merge/serialize + `loadAtlas` regeneration (core inversion, HIGH risk).
2. **WU2** — `federation-marker.js` `enroll` (depends on WU1 serializer conventions).
3. **WU3** — `sdd-init` detection + `target_dir` (skill/agent; independent of WU1/WU2).
4. **WU4** — `sdd-workspace` `enroll` + `explore` subcommand (depends on WU1/WU2).
5. **WU5** — `.gitignore`, `persistence-contract.md`, orchestrator note (docs; last).

Forecast guidance for `sdd-tasks`: likely **exceeds the 400-line budget**. Since delivery is
`single-pr`, recommend requesting `size:exception` OR a Feature Branch Chain in the order
WU1 → WU2 → {WU3, WU4} → WU5, each slice autonomously testable with `npm test`.

## Open Questions

- [x] Consumer-graph reconstruction: RESOLVED 2026-06-17. The marker `provides[]` schema was
      extended to objects `{ id, consumers[], surface }`, so the provider declares its
      consumers and the `impact` contract graph is fully reconstructable from markers in C1.
      Operational caveat (accepted): a consumer added without re-enrolling its provider leaves
      that provider's graph stale until the next `enroll`. Forward this caveat to `sdd-tasks`.
