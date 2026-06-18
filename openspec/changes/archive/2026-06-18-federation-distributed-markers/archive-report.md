# Archive Report — federation-distributed-markers

**Change**: `federation-distributed-markers` (C1 — mechanism layer + workspace-explore phase)
**Archived on**: 2026-06-18
**Archive location**: `openspec/changes/archive/2026-06-18-federation-distributed-markers/`
**Branch**: `feat/federation-distributed-markers` (NOT deleted, NOT pushed — left to the user)
**Final verify verdict**: PASS WITH WARNINGS (`stale: false`, 362/362 tests green)
**Skill resolution**: fallback-config (`openspec/config.yaml`; no `.ospec/cache/skill-registry.cache.json`)

---

## Close Gate Evaluation

| Gate condition | Result |
|----------------|--------|
| Verify verdict is not `FAIL` | ✅ PASS WITH WARNINGS |
| Verify `stale` flag cleared | ✅ `stale: false` (re-verified post-WU7 at 2026-06-18) |
| All CRITICAL/BLOCKER findings closed | ✅ `risk-critical-001` closed by WU6; confirmed by re-review + 362/362 |
| Blocking WARNINGs remediated | ✅ `resilience-warning-001`, `reliability-warning-002`, `risk-warning-symlink-001` closed by WU7 |
| Remaining WARNINGs documented as accepted/follow-up | ✅ W1–W4 + S1–S6 + readability ×2 carried forward to `program.md` (proposed C6 hardening change) |

Archive is **authorized**: no `FAIL`, no open CRITICAL, all open advisories explicitly recorded as follow-up work (not silently dropped).

---

## Specs Synced to Source of Truth (`openspec/specs/`)

| Domain | Action | Details |
|--------|--------|---------|
| `federation-markers` | **Created** (new domain) | Full spec promoted verbatim: 7 requirements (Marker Schema, Atlas as Derived Cache, Atlas Merge Semantics, Enroll Operation, Derived Member State, Impact Set from Provides Consumers, Resumable Bootstrap Lot) + Clarifications (Session 2026-06-17) |
| `workspace-explore` | **Created** (new domain) | Full spec promoted verbatim: 3 requirements (Container Detection, Member Classification, Explore Artifacts) + Clarifications (Session 2026-06-17) |
| `agents` | **Updated** (merge) | ADDED 1 requirement → new `## 10. Federated \`target_dir\` Parameter`: *sdd-init \`target_dir\` Parameter* (3 scenarios). Existing sections 1–9 + Cross-References preserved intact |
| `skills` | **Updated** (merge) | ADDED 2 requirements → new `## 8. Federated Initialization & Enroll`: *sdd-init Multirepo Detection Gate* (3 scenarios) + *sdd-workspace \`enroll\` Operation* (2 scenarios). Cross-References renumbered 8→9. Existing sections 1–7 preserved intact |
| `_baseline/index.md` | **Appended** (append-first) | 2 new domain index lines: `federation-markers`, `workspace-explore` |

### Spec Drift Check

Every delta requirement maps cleanly into the baseline — **no conflicts, no destructive merges**:

| Delta requirement | Baseline target | Mapping |
|-------------------|-----------------|---------|
| Marker Schema | `federation-markers` (new) | 1:1 copy |
| Atlas as Derived Cache | `federation-markers` (new) | 1:1 copy |
| Atlas Merge Semantics | `federation-markers` (new) | 1:1 copy |
| Enroll Operation | `federation-markers` (new) | 1:1 copy |
| Derived Member State | `federation-markers` (new) | 1:1 copy |
| Impact Set from Provides Consumers | `federation-markers` (new) | 1:1 copy |
| Resumable Bootstrap Lot | `federation-markers` (new) | 1:1 copy |
| Container Detection | `workspace-explore` (new) | 1:1 copy |
| Member Classification | `workspace-explore` (new) | 1:1 copy |
| Explore Artifacts | `workspace-explore` (new) | 1:1 copy |
| sdd-init `target_dir` Parameter | `agents` §10 | ADDED — no name collision with §1–§9 |
| sdd-init Multirepo Detection Gate | `skills` §8 | ADDED — no name collision with §1–§7 |
| sdd-workspace `enroll` Operation | `skills` §8 | ADDED — no name collision |

No baseline requirement was modified or removed. No REMOVED/MODIFIED deltas were present (all deltas were purely ADDED).

---

## Follow-up Findings Carried Forward (NOT dropped)

Recorded in `program.md` › *Hallazgos no bloqueantes heredados de C1* and proposed for a dedicated hardening change **C6 — `federation-c1-hardening`**:

| Id | Type | Summary |
|----|------|---------|
| W1 | spec-gap | Cross-spec wording inconsistency (`workspace-explore` vs `federation-markers`) re: what is stored in the marker |
| W2 | design-gap | `isCorruptCache` heuristic could regenerate a legitimately empty federated workspace |
| W3 / `reliability-warning-001` | code-bug / known-flake | Non-deterministic `git` integration test (no `spawnSync` DI seam); did NOT reproduce in verify |
| W4 | design-gap (inherent) | Agent-procedure scenarios proven only by `static-proof` content-contract, not runtime |
| S1 | suggestion | Explore-written markers omit `roster`/`remote` → noisy fail-open warnings |
| S2 | suggestion | `federation-explore.js` not in design *File Changes* table — design traceability |
| S3 | suggestion | Explore non-atomic multi-artifact write (no transactional barrier) |
| S4–S6 / readability ×2 | suggestion / readability | Cosmetic naming/comment density in new lib modules |

---

## Archive Contents (audit trail)

- `proposal.md` ✅
- `design.md` ✅
- `exploration.md` ✅
- `specs/` (federation-markers, workspace-explore, agents, skills) ✅
- `tasks.md` ✅ (33/33 Phase 1–6 tasks complete)
- `apply-progress.md` ✅ (WU1–WU7)
- `verify-report.md` ✅ (PASS WITH WARNINGS, 362/362)
- `program.md` ✅ (program anchor with carried-forward follow-ups)
- `archive-report.md` ✅ (this file)
- `state.yaml` ✅ (archived)

---

## Git Handling

- The 7 work-unit commits (`4efe753`, `f30ab07`, `06462da`, `fda2c5e`, `c3d3ff7`, `8656fc4`, `a6e3c46`) remain on `feat/federation-distributed-markers`.
- The feature branch was **NOT deleted** and **NOT pushed** — remote operations are left to the user.
- No archive git commit was auto-created. The spec-sync changes are left for the user to stage/commit.

### Suggested Conventional-Commit message (no model attribution)

```
chore(openspec): archive federation-distributed-markers (C1)

Promote C1 delta specs into the source of truth and close the change:
- add federation-markers and workspace-explore domain specs
- merge sdd-init target_dir into agents spec (§10)
- merge sdd-init multirepo gate + sdd-workspace enroll into skills spec (§8)
- index new domains; carry C1 advisories forward to program.md (C6)
- move change folder to openspec/changes/archive/2026-06-18-federation-distributed-markers/

Verify: PASS WITH WARNINGS, 362/362 tests, stale=false.
```

### Manual step required (no move/delete tooling available to the archive agent)

The agent environment exposes no terminal nor move/delete file operation, so the physical folder relocation MUST be completed by the user with a single git-aware move (preserves history and keeps the working tree clean):

```bash
git mv openspec/changes/federation-distributed-markers \
       openspec/changes/archive/2026-06-18-federation-distributed-markers
```

All artifacts (including this report and the archived `state.yaml`) move atomically with that command.

---

## SDD Cycle Complete

`federation-distributed-markers` (C1) is planned, implemented, verified, and its specs are promoted to the source of truth. The change is logically archived; only the `git mv` relocation remains as a user step. Follow-on changes C2–C5 are registered in `program.md`; advisory follow-ups are tracked for proposed C6.
