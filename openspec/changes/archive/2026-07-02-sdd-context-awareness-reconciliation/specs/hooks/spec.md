# Delta for hooks

## ADDED Requirements

### Requirement: Domain Drift Detection Helper

`scripts/lib/ospec-state.js` MUST expose a domain-drift helper that, given a baseline domain's recorded manifest commit hash (from `openspec/specs/_baseline/manifest.md`'s Entries table) and that domain's source globs (from the manifest Domain Map), determines whether the domain has drifted since that hash.

The helper MUST:
- Compare `git diff --name-only <hash>..HEAD`, filtered by the domain's source globs; a non-empty filtered result means the domain is drifted.
- Resolve each domain's source globs by parsing the existing `sources: ...` list already present in that domain's Domain Map bullet in `openspec/specs/_baseline/manifest.md` (format: `- {domain}: {description} | sources: {glob1}, {glob2}, ...`) — split on `,` after the `sources:` marker, trim whitespace per entry. No new manifest field or schema change is required; all 7 recorded domains already carry this list.
- Exclude a domain from the drifted result when any currently active (non-terminal) OpenSpec change's declared scope already covers that domain — an active change already tracks it.
- Run all git probes inside a single shared timeout budget, mirroring the 5 s deadline pattern used by `resolveGitState` in `scripts/hooks/lib/git-state.js`.
- Fail-safe on any git failure (missing hash, empty repo, detached HEAD, missing git binary, non-zero exit): return "no drift data" for the affected domain rather than throwing. Callers (SessionStart, PreToolUse) MUST NOT crash or block on this failure.

#### Scenario: Domain has in-scope changes since hash — drifted

- GIVEN domain `hooks` was last recorded at commit `59fbfe8`
- AND `git diff --name-only 59fbfe8..HEAD` includes a file matching the `hooks` domain's source globs
- WHEN the drift helper evaluates `hooks`
- THEN it MUST report `hooks` as drifted

#### Scenario: Domain has only out-of-scope changes — not drifted

- GIVEN `git diff --name-only <hash>..HEAD` returns files, none of which match the domain's source globs
- WHEN the drift helper evaluates the domain
- THEN it MUST report the domain as NOT drifted

#### Scenario: Drift covered by an active change's declared scope — suppressed

- GIVEN a domain has in-scope changes since its recorded hash
- AND an active (non-terminal) OpenSpec change's declared file scope already covers that domain
- WHEN the drift helper evaluates the domain
- THEN it MUST NOT report the domain as drifted

#### Scenario: git failure — fail-safe, no throw

- GIVEN the recorded hash no longer exists in history, OR git is not installed, OR the repository is empty/detached
- WHEN the drift helper evaluates any domain
- THEN it MUST return "no drift data" for that domain and MUST NOT throw or abort the calling hook

#### Scenario: Source globs resolved from the existing manifest Domain Map — no new field required

- GIVEN `openspec/specs/_baseline/manifest.md`'s Domain Map already lists `sources: scripts/hooks/*.js, hooks/hooks.json, scripts/lib/ospec-state.js, scripts/lib/artifact-store.js, scripts/lib/workspace-atlas.js` for the `hooks` domain
- WHEN the drift helper resolves source globs for `hooks`
- THEN it MUST parse that existing `sources:` list (split on `,`, trimmed) as the domain's glob set
- AND it MUST NOT require any additional manifest field, file, or explicit glob-mapping to be introduced

---

### Requirement: SessionStart Spec Drift Summary

The `SessionStart` hook MUST run the domain-drift check during its initialization sequence, after the git collaboration advisory, when openspec is detected AND `DISABLE_SPEC_DRIFT_GUARD !== "true"`. It evaluates every domain in `baseline.domains_done` that has a recorded manifest hash.

When one or more domains are drifted, the hook MUST include a `specDrift` entry in the response JSON:

```json
{
  "specDrift": {
    "status": "warning",
    "domains": [
      { "domain": "hooks", "sinceCommit": "59fbfe8", "message": "<human-readable advisory>" }
    ]
  }
}
```

and MUST append a human-readable summary line (naming the drifted domains) to `systemMessage`.

When NO domain is drifted, OR `DISABLE_SPEC_DRIFT_GUARD=true`, OR openspec is not initialized: `specDrift` MUST be entirely absent from the response (never an empty object or empty `domains` array) — mirroring the omission pattern already used by `baseline.hint` and `capabilities`.

#### Scenario: Domains drifted — summary present

- GIVEN two domains report drifted from the domain-drift helper
- AND `DISABLE_SPEC_DRIFT_GUARD` is unset
- WHEN SessionStart runs
- THEN the response MUST include `specDrift.status: "warning"` listing both domains
- AND `systemMessage` MUST include a line naming both domains

#### Scenario: No domain drifted — field omitted

- GIVEN the domain-drift helper reports zero drifted domains
- WHEN SessionStart runs
- THEN the response MUST NOT contain a `specDrift` key at all

#### Scenario: Guard disabled — field omitted regardless of drift

- GIVEN `DISABLE_SPEC_DRIFT_GUARD=true`
- AND at least one domain would otherwise report drifted
- WHEN SessionStart runs
- THEN no `specDrift` key is present in the response
- AND no drift computation side effects (no file writes) occur

#### Scenario: openspec not initialized — no drift check runs

- GIVEN `openspec/config.yaml` is absent
- WHEN SessionStart runs
- THEN the existing early-return path applies (§2.1) and the drift check MUST NOT run

---

### Requirement: Pre-Commit Drift Advisory Step in PreToolUse

The `PreToolUse` decision chain (§3.4) MUST include a new evaluation step for the spec-drift advisory, inserted after the git collaboration guard (Step 5b) and before the existing ASK rules (Step 6).

**Revised evaluation order** (addition in bold):

| Step | Name | Returns |
|------|------|---------|
| 5 | DENY rules | `deny` |
| 5b | GIT COLLABORATION GUARD | `ask` |
| **5c** | **SPEC DRIFT ADVISORY** | **`ask`** |
| 6 | ASK rules | `ask` |
| 7 | ALLOW | `allow` |

Step 5c fires when: the command matches `\bgit\s+commit\b`, AND the domain-drift helper (independently invoked by this hook, since hooks are stateless per-invocation processes — no state is shared with SessionStart) reports at least one drifted domain whose source globs overlap the staged files (`git diff --name-only --cached`), or — best-effort, when staged-file resolution fails — the command's target files. When it fires, the hook MUST return `ask` (never `deny`) with a reason string naming the drifted domain(s).

Step 1 BYPASS MUST recognize `DISABLE_SPEC_DRIFT_GUARD=true` and skip Step 5c entirely when active (existing bypass variables `DISABLE_AGENT_SHIELD`, `DISABLE_TOKEN_ADVISOR`, `DISABLE_GIT_COLLABORATION_GUARD` are unaffected).

Because Step 5 (DENY) executes before Step 5c, a matching DENY rule always wins — the advisory is never reached when a command is denied.

#### Scenario: Staged files overlap a drifted domain — ask fires

- GIVEN a `git commit` command
- AND staged files include a file matching the `hooks` domain's source globs
- AND the `hooks` domain is currently drifted
- WHEN PreToolUse evaluates the call
- THEN Step 5c MUST return `ask` with a reason naming `hooks`

#### Scenario: No overlap — advisory does not fire

- GIVEN a `git commit` command
- AND staged files do not overlap any drifted domain's globs
- WHEN PreToolUse evaluates the call
- THEN Step 5c MUST NOT fire and evaluation proceeds to Step 6

#### Scenario: DENY fires first — advisory never evaluated

- GIVEN a tool call matches a DENY rule (Step 5)
- WHEN PreToolUse evaluates the call
- THEN the hook returns `deny` at Step 5
- AND Step 5c is never invoked

#### Scenario: Bypass active — advisory skipped, no residual state

- GIVEN `DISABLE_SPEC_DRIFT_GUARD=true`
- WHEN PreToolUse evaluates a `git commit` command that would otherwise trigger Step 5c
- THEN Step 5c is skipped entirely
- AND no drift computation occurs and no file or state is written as a side effect

## Clarifications

### Session 2026-07-01

- Q: Domain→path ownership rule for drift detection — does the drift helper need a new explicit glob mapping added to the manifest, or can it derive source globs from something already recorded there? → A: Derive them from the existing `sources: ...` list already present in each domain's Domain Map bullet in `openspec/specs/_baseline/manifest.md` (confirmed present for all 7 recorded domains: generator, routing, hooks, skills, agents, skill-registry, install). No new manifest field, file, or schema change is introduced. Parsing convention: split the text after the `| sources:` marker on `,`, trim whitespace per entry; each resulting entry is a literal path or glob pattern (`*`/`**`) relative to repo root. This is encoded as a normative bullet and scenario under "Domain Drift Detection Helper" above.
- Q: Is `DISABLE_SPEC_DRIFT_GUARD` the single kill switch for BOTH the session-start drift summary and the pre-commit advisory, or should each be independently toggleable? → A: Confirmed single kill switch for both, as already specified in this delta (SessionStart Spec Drift Summary requirement and PreToolUse Step 1 BYPASS bullet). This mirrors the existing one-variable-covers-both-hook-paths precedent already in the codebase: `DISABLE_GIT_COLLABORATION_GUARD` gates both the SessionStart advisory (`scripts/hooks/session-start.js:167`) and the PreToolUse ask-rule (`scripts/hooks/pre-tool-use.js:392`) under a single variable, and `DISABLE_AGENT_SHIELD` follows the same pattern across both hooks. Both concerns are a single logical guard spanning two hook entry points, not two independent concerns — so no independent per-hook toggle is introduced. No normative text changed as a result (the spec already reflected this); this session records the confirmed rationale.
