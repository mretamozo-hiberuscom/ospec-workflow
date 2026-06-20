# Design: Capability Registry & Stack Skills

## Technical Approach

Make project capabilities a first-class, declared list in `openspec/config.yaml`,
add a fourth **stack-skill tier** under `skills/`, and teach the existing
fingerprint+cache registry to index a `capabilities` array on every skill entry.
Selection stays faithful to ECC: the **orchestrator** intersects the declared
capability list with each skill's `capabilities[]` (deterministic candidate set),
then applies **semantic judgment** over each candidate's `description` +
`capabilities` against the sub-agent's task intent — there is no `domain:` field
anywhere. Work splits exactly like routing/lifecycle-hooks: **pure, unit-tested JS
helpers** (`scripts/lib/`, zero I/O) own parsing and the deterministic
candidate-resolution core; the **orchestrator agent markdown** owns effects
(reading the cache, judgment selection, prompt composition). This realizes every
MUST scenario across the four change-local specs (`capability-registry`, `skills`,
`skill-registry`, `agents`) while reusing the live `discoverSkills` + cache path
and keeping `CACHE_VERSION` at `2`.

## Architecture Decisions

### Decision 1: New pure module `scripts/lib/capability-registry.js`, not an extension of `skill-registry.js`

**Choice**: Add a separate pure module for config-capability parsing and the
capability→skill matching core. `skill-registry.js` keeps owning discovery/cache.

**Alternatives considered**: fold everything into `skill-registry.js`; do all
parsing inline in `session-start.js`.

**Rationale**: Discovery (filesystem → cache) and capability resolution (config +
cache → candidate set) are distinct concerns. A dedicated module mirrors the
`route-dispatcher.js` / `lifecycle-hooks.js` precedent: a small, pure, colocated-
test decision core. `session-start.js` already reads `configContent` for the
baseline hint, so the new parser consumes that string with no extra I/O.

### Decision 2: `capabilities[]` parsed via an `extractCapabilities` helper mirroring `extractTriggers`

**Choice**: In `skill-registry.js`, `parseFrontmatter` returns the inline YAML
array `capabilities: [angular, tailwind]` as the raw string `"[angular, tailwind]"`.
Add `extractCapabilities(raw)` that splits on `,`/`;`, trims, strips `[`/`]`, and
adds/drops empties — the exact convention `extractTriggers` uses. `discoverSkills` sets
`capabilities: extractCapabilities(attributes.capabilities || "")` on every entry,
yielding `[]` when the field is absent.

**Alternatives considered**: a real YAML array parser; a bespoke regex.

**Rationale**: The repo has no YAML lib and `parseFrontmatter` flattens nested/
inline structures to scalars by design. Reusing the trigger-splitting convention is
consistent, already battle-tested, and satisfies the skill-registry delta verbatim.

### Decision 3: Deterministic candidate-resolution core in JS; semantic selection in orchestrator markdown

**Choice**: `matchStackSkills(activeNames, skillEntries)` (pure) returns the
candidate set — entries whose `capabilities[]` intersect `activeNames` (exact,
case-sensitive) — sorted by `id` (the AMBIGUITY-A3 deterministic tie-break). The
orchestrator markdown performs the **judgment** step over that candidate set.

**Alternatives considered**: do the intersection only in markdown (untestable);
push judgment into JS (impossible — it needs task intent).

**Rationale**: The deterministic half is unit-testable under `strict_tdd`; the
semantic half is inherently an agent decision. This is the lifecycle-hooks pattern
(tested decision core that the orchestrator mirrors at runtime). With one seed
skill per technology the multi-skill tie-break never fires in v1.

### Decision 4: `runSessionStart` surfaces a top-level `capabilities: string[]` field

**Choice**: When `config.yaml` has a non-empty `capabilities:` block, the result
object gains `capabilities: ["angular", "postgres"]` (declaration order). When the
block is absent or empty, the key is **omitted** (no empty array) — identical to
the `baseline`/`security` optional-key style already in `runSessionStart`.

**Rationale**: Matches the capability-registry SessionStart spec exactly and the
existing optional-field convention. No `CACHE_VERSION` bump: stack-skill files are
new fingerprint inputs, so the cache regenerates through the normal staleness path.

### Decision 5: Capabilities authored in YAML block-sequence form

**Choice**: The authored shape is a block sequence (one `- name:` per
entry), consistent with `routing:` and `hooks:` in this repo. `parseCapabilities`
targets block form and tolerates inline `capabilities: []` as empty. The inline
flow-map examples in the capability-registry spec scenarios are illustrative of the
**data model**; they normalize to block form on disk.

**Rationale**: Every line-based parser in `ospec-state.js` reads block form;
hand-writing a flow-map tokenizer would be fragile. Flagged as a residual decision.

## Data Flow

```
openspec/config.yaml  ──parseCapabilities()──▶  [{name,version,source}, ...]
   (capabilities: block)                              │ capabilityNames()
                                                       ▼
runSessionStart ──▶ result.capabilities: ["angular","postgres"]  (session cache)
                                                       │
skills/stack-*/SKILL.md ─discoverSkills()▶ cache.skills[].capabilities: ["angular"]
                                                       │
        orchestrator (per code-touching sub-agent launch)
                                                       ▼
   matchStackSkills(activeNames, cache.skills) ─▶ candidate set (sorted by id)
                                                       │  judgment: description+
                                                       │  capabilities vs task intent
                                                       ▼
   inject compact_rules into ## Project Standards (auto-resolved)
   (appended after utility skills; combined utility+stack ≤ 5)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/capability-registry.js` | Create | Pure: `parseCapabilities(configContent)`, `capabilityNames(entries)`, `matchStackSkills(names, skillEntries)`. Zero I/O. |
| `scripts/lib/capability-registry.test.js` | Create | Unit tests, RED-first (`strict_tdd`). |
| `scripts/lib/skill-registry.js` | Modify | Add+export `extractCapabilities(raw)`; set `capabilities` on each `discoverSkills` entry. `shouldIncludeSkill`/`CACHE_VERSION` unchanged. |
| `scripts/lib/skill-registry.test.js` | Modify | Add `extractCapabilities` cases; update existing `discoverSkills` `deepEqual` to include `capabilities` (golden). |
| `scripts/hooks/session-start.js` | Modify | Parse capabilities from already-read `configContent`; set optional `result.capabilities`. `CACHE_VERSION` stays `2`. |
| `scripts/hooks/session-start.test.js` | Modify | Surfacing present/absent; key-omitted; regen on stack-skill add. |
| `skills/stack-angular/SKILL.md` | Create | Seed: `capabilities: [angular]`. |
| `skills/stack-dotnet/SKILL.md` | Create | Seed: `capabilities: [dotnet]`. |
| `skills/stack-postgres/SKILL.md` | Create | Seed: `capabilities: [postgres]`. |
| `agents/sdd-orchestrator.agent.md` | Modify | New "Capability-Aware Stack-Skill Injection" subsection (candidate resolution, judgment, 5-cap, no-op, exclude `sdd-archive`/`sdd-init`). |
| `skills/_shared/skill-resolver.md` | Modify | Add `capabilities` to cache-shape example; document candidate + judgment selection + 5-cap. |
| `skills/_shared/openspec-convention.md` | Modify | Document `capabilities:` config block, cache-entry `capabilities` field, SessionStart `capabilities` result field. |
| `openspec/config.yaml` | Modify | Add commented `capabilities:` example (absent = no-op baseline). |
| `dist/**/...` | Regenerate | Propagate md edits to all 4 targets via `npm run build:*`. Do NOT hand-edit. |

## Interfaces / Contracts

### Stack-skill `SKILL.md` frontmatter (utility tier, plus `capabilities`)

```yaml
---
name: stack-angular
description: "Angular frontend framework — standalone components, signals, reactive forms, routing, RxJS"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [angular]
---
## Critical Rules
- ...   # at least one rules/patterns section so compact_rules is non-empty
```

No `disable-model-invocation` / `user-invocable` / `delegate_only`; no ORCHESTRATOR
GATE blockquote (it is not an SDD-phase file).

### Cache skill-entry schema (additive)

```json
{ "id": "...", "path": "...", "triggers": ["..."], "compact_rules": ["..."], "capabilities": ["..."] }
```

`capabilities` is always present (non-empty or `[]`), never `null`/absent.

### Pure helper exports (`capability-registry.js`)

`parseCapabilities(configContent)` → ordered `[{name, version|null, source}]`, `[]`
when block absent/empty (`source` defaults to `"declared"`); `capabilityNames(entries)`
→ `string[]` in declaration order; `matchStackSkills(names, skillEntries)` → candidate
entries (intersection, case-sensitive), sorted by `id`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (RED-first) | `parseCapabilities`: full entry (version+source), name-only→`source: declared`, absent→`[]`, `[]`→`[]`, multiple ordered. `capabilityNames` order. `matchStackSkills`: single match, multi union, no match→`[]`, case-sensitive miss, deterministic id sort. | `node --test scripts/lib/capability-registry.test.js` |
| Unit | `extractCapabilities`: `[angular]`, `[angular, tailwind]`, `;`-separated, bracket strip, absent→`[]`. `discoverSkills`: stack entry `capabilities` populated, utility entry `[]`; seed skills indexed with non-empty `compact_rules`. | extend `skill-registry.test.js` (update golden `deepEqual`) |
| Unit | `runSessionStart` surfaces `capabilities` when present, omits key when absent/empty; fingerprint regen + `status: "generated"` on new stack skill; `CACHE_VERSION` stays `2`. | extend `session-start.test.js` |
| Integration / parity | md edits propagate identically to 4 dist targets; seed `SKILL.md` files pass `shouldIncludeSkill` and index. | existing parity/golden + manifest suites |
| Agent-instruction-only | Judgment selection (frontend task → `stack-angular`, not `stack-postgres`), 5-skill combined cap, empty-capability no-op, `sdd-archive`/`sdd-init` exclusion. | not unit-testable; review vs `agents` spec scenarios + tested decision core |

**Golden implications**: existing `discoverSkills` `deepEqual` assertions gain a
`capabilities` key; tests asserting the full real registry skill list/count must add
the three `stack-*` entries.

## Migration / Rollout

No migration. Purely additive and opt-in: no `capabilities:` block and no `stack-*`
skills = verbatim pre-capabilities behavior. Rollback = remove stack skills + revert
config/registry/resolver/orchestrator edits; cache regenerates from fingerprint.

## Open Questions

- [ ] Residual (Decision 5): config authored in block form; inline flow-map spec
  scenarios normalize to block form. Confirm at apply if a flow-map fixture is needed.
- [ ] `matchStackSkills` is a tested decision core not wired to a JS runtime caller
  (orchestrator mirrors it in markdown) — accepted, mirrors lifecycle-hooks precedent.
- [ ] Concept doc `docs/sdd-capabilities.md` deferred unless requested (out of the
  proposal's Affected Areas).
