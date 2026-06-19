# Spec: federation-c1-hardening (C6)

## Purpose

Harden the federation mechanism layer by resolving 5 advisory findings (W1, W2, W3, S1, S4-S6) inherited from C1 (`federation-distributed-markers`). This spec covers terminology alignment, cache corruption detection, git DI seam, explore marker completeness, and code quality cosmetics.

---

## Requirements

### Requirement 1: Spec Terminology Alignment (W1)

The `workspace-explore` spec MUST adopt the terminology of `federation-markers` spec when referring to marker contents, schema, and fields. `federation-markers` is the authoritative spec for the marker contract.

Specifically:
- Any phrase in `workspace-explore/spec.md` that describes what is stored in a marker MUST use the same vocabulary as `federation-markers/spec.md`
- `workspace-explore` MUST reference `federation-markers` spec as the source of truth for the marker schema via a cross-reference

#### Scenario: Cross-reference present in workspace-explore spec

- GIVEN the `workspace-explore/spec.md` file
- WHEN a reader looks for the marker schema definition
- THEN the spec contains an explicit cross-reference to `federation-markers` spec for the marker schema
- AND does NOT redefine or paraphrase the marker fields in its own terms

---

### Requirement 2: Empty Workspace Detection (W2)

The `isCorruptCache` heuristic in the workspace-federated artifact store MUST distinguish between a corrupt cache file and a legitimately empty workspace.

- A workspace.yaml that contains valid structural markers (`members:` and/or `contracts:` sections) but with zero entries MUST NOT be classified as corrupt
- A workspace.yaml whose content is non-empty but does NOT parse into a recognizable atlas structure (no `members:` header, no `contracts:` header) MUST be classified as corrupt
- When a workspace.yaml is detected as corrupt, the system MUST regenerate from member markers and emit a warning

#### Scenario: Empty workspace is NOT corrupt

- GIVEN a workspace.yaml with content `members:\ncontracts:\n` (valid headers, empty lists)
- WHEN the atlas loader checks for corruption
- THEN `isCorruptCache` returns `false`
- AND the system uses the parsed (empty) atlas without regeneration

#### Scenario: Garbage content IS corrupt

- GIVEN a workspace.yaml with content `::: not valid atlas yaml :::`
- WHEN the atlas loader checks for corruption
- THEN `isCorruptCache` returns `true`
- AND the system regenerates from member markers with a warning

#### Scenario: Valid atlas with members is NOT corrupt

- GIVEN a workspace.yaml with one member entry
- WHEN the atlas loader checks for corruption
- THEN `isCorruptCache` returns `false`

---

### Requirement 3: Git Integration DI Seam (W3)

The `warnIfGitTracked` function in the workspace-federated artifact store MUST accept a git execution dependency via injection rather than importing `spawnSync` directly.

- The factory function `createWorkspaceFederatedStore` MUST accept an optional `execGitSync` parameter
- When `execGitSync` is not provided, the factory MUST default to `spawnSync` from `node:child_process`
- `warnIfGitTracked` MUST use the injected dependency exclusively
- The `createArtifactStore` and `createArtifactStoreFromConfig` factories MUST propagate the `execGitSync` parameter

#### Scenario: Default behavior unchanged

- GIVEN no `execGitSync` parameter is provided
- WHEN `createArtifactStore({ mode: "workspace-federated", workspace })` is called
- THEN `warnIfGitTracked` uses the real `spawnSync` from `node:child_process`
- AND the runtime behavior is identical to the pre-hardening version

#### Scenario: Injected mock prevents real git calls

- GIVEN `createArtifactStore({ mode: "workspace-federated", workspace, execGitSync: mockFn })` is called
- WHEN `warnIfGitTracked` runs during atlas loading
- THEN it calls `mockFn` instead of the real `spawnSync`
- AND no real `git` subprocess is spawned

#### Scenario: Test uses mock to verify warning emission

- GIVEN a mock `execGitSync` that returns `{ status: 0, stdout: "openspec/workspace.yaml\n" }`
- WHEN atlas loading triggers `warnIfGitTracked`
- THEN a warning about `git rm --cached` is emitted
- AND the test does not depend on a real git repository

---

### Requirement 4: Explore Marker Roster Field (S1)

The `workspace-explore` phase MUST write `roster: []` explicitly in the marker data passed to `enroll`.

- The `buildMemberData` function in `federation-explore.js` MUST include `roster: []` in the returned object
- `member.remote` MUST remain intentionally absent in explore-generated markers (suppression by origin already handles this)
- The serialized marker file MUST contain a `roster:` line with an empty list

#### Scenario: Explore-enrolled marker has explicit roster

- GIVEN a member repo discovered during workspace-explore
- WHEN `buildMemberData` generates the marker data and `enroll` writes it
- THEN the marker file contains `roster: []`
- AND `member.remote` is absent

#### Scenario: Merge does not emit roster warning for explore markers

- GIVEN a marker with `origin: "explore"` and `roster: []`
- WHEN `mergeMarkersIntoAtlas` processes it
- THEN no warning about missing roster remote is emitted

---

### Requirement 5: Code Quality — Naming and Documentation (S4-S6)

All exported functions in the federation lib modules MUST have JSDoc documentation comments.

Affected modules:
- `scripts/lib/workspace-atlas.js`
- `scripts/lib/federation-marker.js`
- `scripts/lib/federation-explore.js`
- `scripts/lib/federation-baseline-orchestrator.js`

#### Constraints

- JSDoc MUST include `@param` for each parameter and `@returns` for the return type/shape
- Function names MUST align with the vocabulary of `federation-markers` spec (the authoritative spec)
- Internal helper functions MAY have JSDoc but it is not required
- Existing comments that explain "why" (business decisions, workarounds) MUST be preserved

#### Scenario: Exported function has JSDoc

- GIVEN any function in the `module.exports` of a federation lib module
- WHEN a developer reads the source
- THEN a JSDoc block is present directly above the function declaration
- AND it includes `@param` and `@returns` annotations

---

## Clarifications

### Session 2026-06-19

- Q: Should `isCorruptCache` use a structural check (presence of `members:` header) or a semantic check (parsed array length)? → A: Structural check is preferred. The heuristic should detect that the YAML was not parseable into the expected structure, not that the lists happen to be empty. An empty but structurally valid atlas is legitimate.
- Q: Should the DI seam be at the module level (mock the import) or function level (inject as parameter)? → A: Function/factory level via parameter injection. Module-level mocking is fragile across CJS/ESM boundaries.
- Q: Is `W4` (static-proof for agent procedures) accepted as a known limitation? → A: Yes. Documenting it as accepted, not actionable in C6.
- Q: Is `S3` (transactional barrier) resolved? → A: Yes. Confirmed in code: `federation-explore.js` imports and uses `writeFileAtomic` from `atomic-write.js`. Excluded from C6.
