# Tasks: Capability Registry & Stack Skills

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `capabilities:` block absent → empty list, no-op | MUST | `parseCapabilities()` in `capability-registry.js` returns `[]` | covered-by-design | Unit-testable |
| Full entry (name + version + source) parsed correctly | MUST | `parseCapabilities()` block-sequence line parser | covered-by-design | Unit-testable |
| Name-only entry → `source` defaults to `"declared"` | MUST | `parseCapabilities()` default assignment | covered-by-design | Unit-testable |
| `capabilities: []` inline form → treated as empty list | MUST | `parseCapabilities()` bracket-only line → no entries appended | covered-by-design | Unit-testable |
| `capabilityNames()` returns names in declaration order | MUST | `capabilityNames(entries)` → `entries.map(e => e.name)` | covered-by-design | Unit-testable |
| `matchStackSkills`: exact case-sensitive intersection | MUST | `matchStackSkills(names, skillEntries)` in `capability-registry.js` | covered-by-design | Unit-testable |
| `matchStackSkills`: no match → `[]`, no error | MUST | empty-filter path | covered-by-design | Unit-testable |
| `matchStackSkills`: multi-capability union | MUST | `Set(names)` intersection | covered-by-design | Unit-testable |
| `matchStackSkills`: deterministic sort by `id` | MUST | `sort((a,b)=>compareStrings(a.id,b.id))` | covered-by-design | AMBIGUITY-A3 resolved |
| `source: declared` → tooling MUST NOT auto-remove | MUST | schema field only; no detection writer implemented | covered-by-design | Forward-compat slot |
| `source: declared` and `detected` resolve equally | MUST | resolution uses `name`, not `source` | covered-by-design | |
| `runSessionStart` surfaces `capabilities` when block present | MUST | reads `configContent`, calls `parseCapabilities`+`capabilityNames`; sets `result.capabilities` | covered-by-design | Unit-testable |
| `runSessionStart` omits `capabilities` key when absent/empty | MUST | conditional assignment, mirrors optional-field style | covered-by-design | Unit-testable |
| `CACHE_VERSION` stays `2` | MUST | Design Decision 4 explicit; new skills change fingerprint | covered-by-design | |
| `capabilities` field always present on cache entry (`[]` when absent) | MUST | `extractCapabilities(attributes.capabilities \|\| "")` in `discoverSkills` | covered-by-design | Unit-testable |
| `extractCapabilities` splits on `,`/`;`, strips `[`/`]`, drops empties | MUST | Design Decision 2; mirrors `extractTriggers` convention | covered-by-design | Unit-testable |
| Stack skill at `skills/stack-{name}/SKILL.md` passes `shouldIncludeSkill` | MUST | no change needed; `stack-` prefix not excluded by existing filter | covered-by-design | Verified by golden |
| Stack skill MUST NOT carry `disable-model-invocation`/`user-invocable`/`delegate_only` | MUST | authoring contract; no registry filter change | covered-by-design | Author responsibility |
| `description` MUST be meaningful for judgment selection | MUST | authoring contract; no field enforced by code | covered-by-design | |
| Three seed reference skills indexed with non-empty `compact_rules` and `capabilities[]` | MUST | seed files + `extractCompactRules` + `extractCapabilities` | covered-by-design | Parity test |
| Candidate resolution in orchestrator: intersect capabilities with `cache.skills` | MUST | `## Capability-Aware Stack-Skill Injection` section in orchestrator.agent.md | covered-by-design | Agent-instruction-only |
| Judgment-based filtering: description + task intent; no `domain:` field | MUST | orchestrator.agent.md; AMBIGUITY-A2 resolved | covered-by-design | Agent-instruction-only |
| Combined utility + stack cap = 5 | MUST | orchestrator.agent.md + skill-resolver.md | covered-by-design | Agent-instruction-only |
| No-op path when capabilities empty or candidate set empty | MUST | orchestrator.agent.md | covered-by-design | Agent-instruction-only |
| Stack skills NOT injected into `sdd-archive` / `sdd-init` | MUST | exclusion list in orchestrator.agent.md | covered-by-design | Agent-instruction-only |
| Fingerprint regenerated when stack skill added | SHOULD | fingerprint includes `skills/stack-*/SKILL.md`; normal staleness path | covered-by-design | Unit-testable |
| Cache regen on new stack skill → `status: "generated"` | SHOULD | existing `cacheHit` logic; no change needed | covered-by-design | Unit-testable |

### Reconciliation Verdict

- MUST coverage: **complete** — all 25 MUST scenarios have clear design allocation.
- SHOULD/MAY gaps: none blocking. Detection-writer (`source: detected`) is a forward-compat schema slot only; no SHOULD scenarios require it in this change.
- Ambiguities to track: AMBIGUITY-A1 (detection shape), AMBIGUITY-A2 (domain inference), AMBIGUITY-A3 (tie-breaking) — all resolved in `state.yaml`; none block implementation.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1 000–1 100 additions (minimal deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: pure helpers + test suite + seed skills (~580 lines); PR 2: orchestrator MD + docs + config + dist regeneration (~490 lines, generated code dominates) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> Delivery strategy is `single-pr`. A `size:exception` approval or explicit chain strategy selection is required before `sdd-apply` starts. Breakdown by source: `capability-registry.js` ~85 lines, `capability-registry.test.js` ~145 lines, `skill-registry.js` delta ~20 lines, `skill-registry.test.js` delta ~65 lines, `session-start.js` delta ~10 lines, `session-start.test.js` delta ~60 lines, 3 × seed `SKILL.md` ~90 lines, `sdd-orchestrator.agent.md` delta ~70 lines, `skill-resolver.md` delta ~40 lines, `openspec-convention.md` delta ~35 lines, `config.yaml` example ~20 lines, 4 dist targets × ~100 lines generated = ~400 lines. Generated dist artifacts are the largest single contributor and are a natural `size:exception` candidate for PR 2.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `capability-registry.js` + `.test.js` + `skill-registry.js`/`.test.js` extensions + `session-start.js`/`.test.js` extensions + 3 seed `SKILL.md` files (full RED → GREEN cycle; `npm test` green) | PR 1 | Self-contained; no orchestrator changes yet |
| 2 | Orchestrator MD + `skill-resolver.md` + `openspec-convention.md` + `config.yaml` example + all 4 dist regenerations | PR 2 | Depends on PR 1 merged; generated code dominates; `size:exception` candidate |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: RED — Write Failing Tests

- [x] 1.1 Create `scripts/lib/capability-registry.test.js` with `require("node:assert/strict")`, `require("node:test")` boilerplate; import `{parseCapabilities, capabilityNames, matchStackSkills}` from `./capability-registry.js` (file does not exist yet — require throws `MODULE_NOT_FOUND`, making every test fail at load time; acceptable RED signal).
- [x] 1.2 Add failing test group for `parseCapabilities`: (a) config with full block-sequence entry (name + version + source:declared) → `[{name:"angular", version:"17", source:"declared"}]`; (b) name-only entry → `source` defaults to `"declared"`; (c) config with no `capabilities:` key → `[]`; (d) config with `capabilities: []` inline form → `[]`; (e) two entries returned in declaration order.
- [x] 1.3 Add failing test group for `capabilityNames`: (a) array of entries → names in order; (b) empty array → `[]`.
- [x] 1.4 Add failing test group for `matchStackSkills`: (a) single name match on one entry → `[entry]`; (b) two capability names → union of two matched entries; (c) name matches no entry → `[]`; (d) `"Angular"` does not match entry with `capabilities:["angular"]` (case-sensitive); (e) two matched entries returned sorted by `id` (alphabetical).
- [x] 1.5 In `scripts/lib/skill-registry.test.js`, add failing test group for `extractCapabilities` (import it from `./skill-registry.js`): (a) `"[angular]"` → `["angular"]`; (b) `"[angular, tailwind]"` → both items; (c) `"angular;tailwind"` → both items; (d) empty string `""` → `[]`; (e) bracket-strip: `"[ angular ]"` → `["angular"]`.
- [x] 1.6 In the existing `"discovers cacheable skills"` test's `assert.deepEqual(result.skills, [...])` call, add `capabilities: []` to the expected `example` entry shape — this makes the assertion fail with the current `discoverSkills` (no `capabilities` key emitted) → valid RED signal for the golden.
- [x] 1.7 In `scripts/lib/skill-registry.test.js`, add failing test: create a temp root with `skills/stack-angular/SKILL.md` (frontmatter `capabilities: [angular]`) and `skills/example/SKILL.md` (no `capabilities:` field); run `discoverSkills`; assert `stack-angular` entry has `capabilities: ["angular"]` and `example` entry has `capabilities: []`.
- [x] 1.8 In `scripts/hooks/session-start.test.js`, add failing test: `createFixture` with `configContent` containing a block-sequence `capabilities:` entry for `angular` and `postgres`; run `runSessionStart`; assert `result.capabilities` deep-equals `["angular","postgres"]`.
- [x] 1.9 In `scripts/hooks/session-start.test.js`, add failing test: `createFixture` with default `configContent` (no `capabilities:` key); run `runSessionStart`; assert `result.capabilities === undefined` (key absent).
- [x] 1.10 In `scripts/hooks/session-start.test.js`, add failing test: fixture with a `skills/stack-angular/SKILL.md` file (frontmatter `capabilities: [angular]`) added to `pluginRoot` after first run; run `runSessionStart` again; assert `result.registry.status === "generated"` and the cache entry for `stack-angular` has `capabilities: ["angular"]`.
- [x] 1.11 Run `node --test scripts/lib/capability-registry.test.js` → confirm `MODULE_NOT_FOUND` (RED). Run `node --test scripts/lib/skill-registry.test.js` and `node --test scripts/hooks/session-start.test.js` → confirm the new test assertions fail (RED). Do NOT proceed to Phase 2 until RED is confirmed on all three files.

---

## Phase 2: GREEN — Implement Pure Helpers and Extensions

- [x] 2.1 Create `scripts/lib/capability-registry.js` with `"use strict";` header and a module-purity contract comment (zero I/O, no `fs`, no runtime deps — mirrors `route-dispatcher.js` style).
- [x] 2.2 Implement `parseCapabilities(configContent)`: scan `configContent` line-by-line; find the `capabilities:` block; collect `- name:` sub-lines and optional `version:`/`source:` sub-lines on the indented lines that follow; return `[{name, version|null, source}]` in declaration order where `source` defaults to `"declared"` when absent; return `[]` when the block is absent, empty, or has only a bare `[]` value.
- [x] 2.3 Implement `capabilityNames(entries)`: return `entries.map(e => e.name)`.
- [x] 2.4 Implement `matchStackSkills(names, skillEntries)`: build a `Set` from `names`; filter `skillEntries` to those whose `capabilities` array contains any value in the set (exact, case-sensitive); sort the result by `entry.id` using the same `compareStrings` convention used in `skill-registry.js`; return the filtered+sorted array.
- [x] 2.5 Export `{parseCapabilities, capabilityNames, matchStackSkills}`; run `node --test scripts/lib/capability-registry.test.js` → confirm all tests GREEN. Fix implementation (not tests) if any assertion fails.
- [x] 2.6 In `scripts/lib/skill-registry.js`, add and export `extractCapabilities(raw)`: split `raw` on `/[,;]/`, trim each segment, strip leading/trailing `[`/`]` bracket characters, discard empty segments — mirrors the `extractTriggers` splitting convention exactly. Add to `module.exports`.
- [x] 2.7 In `scripts/lib/skill-registry.js`, inside `discoverSkills`, add `capabilities: extractCapabilities(attributes.capabilities || "")` to the `skills.push({...})` call, immediately after `compact_rules`.
- [x] 2.8 Run `node --test scripts/lib/skill-registry.test.js` → confirm all tests GREEN, including the golden `deepEqual` (which now includes `capabilities`) and the new `extractCapabilities` group. Fix implementation if any fail.
- [x] 2.9 In `scripts/hooks/session-start.js`, add `const {parseCapabilities, capabilityNames} = require("../lib/capability-registry.js");` at the top of the imports block.
- [x] 2.10 In `runSessionStart`, after the `configContent` read (inside the `ospecDetected` branch), call `parseCapabilities(configContent)` and `capabilityNames(entries)`; if `names.length > 0`, set `result.capabilities = names` before returning; omit the key when the list is empty — identical to the optional-field style of `result.baseline`.
- [x] 2.11 Run `node --test scripts/hooks/session-start.test.js` → confirm all tests GREEN including the three new capabilities tests. Fix implementation (not tests) if any fail.

---

## Phase 3: Seed Stack Skills

- [x] 3.1 Create `skills/stack-angular/SKILL.md` with frontmatter: `name: stack-angular`, `description: "Angular frontend framework — standalone components, signals, reactive forms, routing, RxJS"`, `license: Apache-2.0`, `metadata.author: manuel-retamozo-garcia`, `metadata.version: "1.0"`, `capabilities: [angular]`; body MUST include a `## Critical Rules` section with at least five actionable Angular-specific rules (no ORCHESTRATOR GATE blockquote; no `disable-model-invocation` / `user-invocable` / `delegate_only`).
- [x] 3.2 Create `skills/stack-dotnet/SKILL.md` with frontmatter: `name: stack-dotnet`, `description: "ASP.NET Core + C# backend — minimal APIs, dependency injection, EF Core, nullable reference types"`, `license: Apache-2.0`, `metadata`, `capabilities: [dotnet]`; body with `## Critical Rules` containing at least five .NET/C# specific rules.
- [x] 3.3 Create `skills/stack-postgres/SKILL.md` with frontmatter: `name: stack-postgres`, `description: "PostgreSQL relational database — SQL migrations, indexing strategy, parameterized queries, connection pooling"`, `license: Apache-2.0`, `metadata`, `capabilities: [postgres]`; body with `## Critical Rules` containing at least five PostgreSQL-specific rules.
- [x] 3.4 Spot-check indexing: run `node -e "const r=require('./scripts/lib/skill-registry.js'); r.discoverSkills('.').then(x=>x.skills.filter(s=>s.id.startsWith('stack-')).forEach(s=>console.log(s.id, JSON.stringify(s.capabilities), s.compact_rules.length)))"` from the repo root; confirm all three seeds appear with non-empty `capabilities[]` and `compact_rules.length > 0`.

---

## Phase 4: Orchestrator and Documentation Updates

- [x] 4.1 Open `agents/sdd-orchestrator.agent.md`; add a new subsection `## Capability-Aware Stack-Skill Injection` (place it after the existing Project Standards / skill-resolution section). Document: (a) read `result.capabilities` from the session cache produced by `runSessionStart` (absent key = no capabilities active → skip all steps silently); (b) candidate resolution — filter `cache.skills` to entries whose `capabilities[]` contains any active capability name (exact, case-sensitive), sorted by `id`; (c) judgment-based task-domain filtering — for each candidate read its `description` and `capabilities` against the current sub-agent task's content and intent; include only semantically relevant skills (no `domain:` field, judgment only); (d) inject filtered candidates' `compact_rules` into `## Project Standards (auto-resolved)` block, appended after utility-skill compact rules; (e) combined utility + stack injection cap = 5 skill blocks; (f) no-op when capabilities empty or candidate set empty; (g) DO NOT inject stack skills into `sdd-archive` or `sdd-init` dispatches.
- [x] 4.2 Open `skills/_shared/skill-resolver.md`; add `capabilities: ["<string>", ...]` to the cache skill-entry shape example; add a paragraph after the trigger-matching step documenting the stack-skill candidate resolution step (capability-name intersection → judgment filter → append to `## Project Standards`, respecting the 5-skill combined cap); note exclusions (`sdd-archive`, `sdd-init`).
- [x] 4.3 Open `skills/_shared/openspec-convention.md`; add documentation for the `capabilities:` `config.yaml` block (block-sequence schema with `name`, optional `version`, optional `source` defaulting to `declared`; absent = strict no-op); add `capabilities: []` field to the cache skill-entry schema example shown in the doc; add `capabilities: string[]` to the `runSessionStart` result field table (omitted when empty).
- [x] 4.4 Open `openspec/config.yaml`; append a fully commented `capabilities:` example block (all lines prefixed with `#`; show at least two entries in block-sequence form with `name`, `version`, and `source` fields illustrated; include a note that the absent block is a strict no-op); place it immediately after the closing `hooks:` block comment, following the same documentation-comment style.

---

## Phase 5: Dist Regeneration and Full Test Suite

- [x] 5.1 Run `npm run build:claude` to regenerate `dist/claude-marketplace/**` from the modified `agents/sdd-orchestrator.agent.md`, `skills/_shared/skill-resolver.md`, and `skills/_shared/openspec-convention.md`; do NOT hand-edit any file under `dist/`.
- [x] 5.2 Run `npm run build:copilot` to regenerate `dist/github-copilot/**`.
- [x] 5.3 Run `npm run build:vscode` to regenerate `dist/vscode/**`.
- [x] 5.4 Run `npm run build:opencode` to regenerate `dist/opencode/**`.
- [x] 5.5 Run `npm test` (invokes `node scripts/check.js` which runs all `scripts/**/*.test.js`); confirm all pass including: `capability-registry.test.js` (pure helper), updated `skill-registry.test.js` (golden `capabilities` field, `extractCapabilities` group, stack-seed indexing), updated `session-start.test.js` (capabilities surfacing present/absent/regen), `manifest-sync.test.js` (parity check now includes 3 new seed skills), `validate-github-copilot.test.js`, `validate-opencode.test.js`, and the full existing suite. Result: 0 errors, 0 warnings — all checks passed.

---

## Phase 6: Expand Stack Skills and Sync with ECC

- [x] 6.1 Update `skills/stack-dotnet/SKILL.md` with C#/.NET guidelines from ECC (preserving the agnostic/adaptive project flavor rules).
- [x] 6.2 Update `skills/stack-angular/SKILL.md` with Angular guidelines from ECC.
- [x] 6.3 Create `skills/stack-java/SKILL.md` based on Java coding standards and Spring Boot patterns from ECC (capability name: `java`).
- [x] 6.4 Create `skills/stack-kafka/SKILL.md` covering Apache Kafka best practices: idempotence, DLQ, manual offsets, schema-registry, partitioning (capability name: `kafka`).
- [x] 6.5 Create `skills/stack-sqlserver/SKILL.md` covering MS SQL Server best practices: clustered/non-clustered indexes, RCSI, set-based operations, SARGability, short transactions (capability name: `sqlserver`).
- [x] 6.6 Update unit and integration tests (including golden cache and manifests in `scripts/hooks/session-start.test.js` and `scripts/lib/skill-registry.test.js`) to accommodate the 3 new stack skills (java, kafka, sqlserver).
- [x] 6.7 Regenerate all distribution targets (`npm run build:claude`, `build:copilot`, `build:vscode`, `build:opencode`) to compile the new skills.
- [x] 6.8 Run `npm test` to verify that everything compiles and all tests pass.
