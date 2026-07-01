# Design: SDD Context Awareness & Spec Reconciliation

## Technical Approach

Design mode: **design-after-spec** — the three delta specs (`hooks`, `agents`, `spec-reconciliation`) exist and constrain the work below. Every MUST scenario is allocated to a component in the File Changes table.

One shared, synchronous drift primitive in `scripts/lib/ospec-state.js` powers everything. Both runtime hooks call it additively, mirroring the existing `git-collaboration-guard`: `SessionStart` gains a `specDrift` block after the git-collaboration advisory, and `PreToolUse` gains **Step 5c** after Step 5b. The ambient-awareness gate is prose-only in `agents/sdd-orchestrator.agent.md`. `/sdd-reconcile` is a new command+skill pair that folds a domain's diff window back into its spec. All new hook paths sit behind `DISABLE_SPEC_DRIFT_GUARD` and are wrapped so they can never break session start or a tool call.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|----------|--------|-----------------------|-----------|
| Drift helper is **synchronous** | `detectSpecDrift(...)` returns a plain object, no `Promise` | Async like the rest of `ospec-state.js` | `evaluateToolUse` in `pre-tool-use.js` is synchronous and returns its decision inline; it cannot `await`. A sync helper (sync `fs` + injected `execFileSync`-style runner) is callable from BOTH hooks — the async SessionStart calls it without `await`. Mirrors `resolveGitState` (also sync). |
| **Both hooks share one helper**; no git logic duplicated in hook files | `detectSpecDrift` does all git/manifest work; `readStagedFiles` (also exported) does the one extra probe PreToolUse needs | Give PreToolUse its own `git diff --cached` plumbing | PreToolUse needs the *same* drift set plus a staged-file intersection. Centralizing both git probes in `ospec-state.js` keeps the hook files free of git invocation, per the proposal's "reuse existing primitives" mandate. |
| Domain→glob source | Parse the existing `\| sources:` list on each Domain Map bullet | New manifest field | Clarified: all 7 domains already carry `sources:`; no schema change (hooks spec, "no new field" scenario). |
| Drift = diff filtered in JS, not via git pathspec | `git diff --name-only <hash>..HEAD` → filter names with a local glob matcher | Pass globs as git pathspecs | JS filtering yields the changed-file list PreToolUse must intersect against staged files, and keeps `**`/`*` semantics identical across both call sites. |
| Timeout budget | One shared 5 s deadline split across all per-domain `git diff` probes | Per-probe 5 s | Matches `resolveGitState`'s `deadline = Date.now()+5000` + `remaining()` pattern; bounds cost on large repos (risk row). |
| Active-change suppression signal | A domain is covered when any non-terminal change has `openspec/changes/{name}/specs/{domain}/` | Parse a declared file-scope list | Change specs are already keyed by baseline domain name; a directory probe is cheap, sync, and unambiguous. |
| Bypass placement | `DISABLE_SPEC_DRIFT_GUARD` checked in the **hooks**, not the helper | Gate inside helper | Mirrors `DISABLE_GIT_COLLABORATION_GUARD` (checked in `session-start.js:167` / `pre-tool-use.js:392`); single switch covers both paths (clarified). |
| Reconcile ships as the full triplet, matching every existing phase with zero exceptions | `commands/sdd-reconcile.prompt.md` (`agent: sdd-orchestrator`) + `skills/sdd-reconcile/SKILL.md` (`delegate_only: true`, `user-invocable: false`) + `agents/sdd-reconcile.agent.md` (the executor) | Command+skill only, no agent file | Verified against `skills/sdd-baseline/SKILL.md`: a `delegate_only` skill is a stop-sign ("STOP. Do NOT execute these instructions inline. Delegate to the dedicated sub-agent. This skill is for EXECUTORS only."), not the executor itself — the executor content lives in `agents/sdd-baseline.agent.md`. All 13 existing SDD phases (`sdd-init` … `sdd-workspace`) carry the same three files with no exception; omitting the agent file for `sdd-reconcile` would leave the orchestrator's delegation with nothing to dispatch to. |

## Interfaces / Contracts

New exports from `scripts/lib/ospec-state.js`:

```js
// Synchronous. Never throws — git/manifest failure yields null or fewer domains.
detectSpecDrift({
  workspace = process.cwd(),
  gitRunner,            // (args:string[], timeoutMs?:number) => string; default = execFileSync git in `workspace`
  timeoutMs = 5000,
}) => null | {
  status: "warning",
  domains: Array<{
    domain: string,      // e.g. "hooks"
    sinceCommit: string, // latest manifest hash, e.g. "59fbfe8"
    sources: string[],   // parsed globs, for PreToolUse intersection
    files: string[],     // changed files in the diff window (already glob-filtered)
  }>,
}

readStagedFiles(gitRunner, timeoutMs) => string[] | null   // `git diff --name-only --cached`; null on failure
matchesGlobs(file, globs) => boolean                       // `**`→any segments, `*`→non-separator run
```

Steps performed by `detectSpecDrift`: read `openspec/config.yaml` (sync) → `readBaselineState().domains_done`; read `openspec/specs/_baseline/manifest.md` (sync) → parse Domain Map `sources:` + latest Entries row per domain (latest-row-wins); list non-terminal changes' `specs/*` subdirs for suppression; per remaining domain run `git diff --name-only <hash>..HEAD` under the shared deadline, filter by globs; any git failure ⇒ skip that domain (no throw). Returns `null` when zero domains drift.

`result.specDrift` shape in SessionStart (mirrors `result.gitCollaboration`; emitted only when ≥1 domain drifts and guard is off):

```json
{ "specDrift": { "status": "warning",
  "domains": [ { "domain": "hooks", "sinceCommit": "59fbfe8",
                 "message": "El dominio 'hooks' ha derivado desde 59fbfe8. Considera /sdd-reconcile hooks." } ] } }
```

## Data Flow

```
scripts/lib/ospec-state.js
   detectSpecDrift ──┬── session-start.js  (all drifted domains → result.specDrift + systemMessage)
                     └── pre-tool-use.js   (drifted domains ∩ readStagedFiles → Step 5c ask)
```

SessionStart — new block appended after the git-collaboration `if` (current line ~208), before `return result`:

```
DISABLE_SPEC_DRIFT_GUARD=true ? ─► skip (no specDrift key, no git calls, no writes)
try {
  driftRunner = gitRunner || workspaceGitRunner   // reuse the workspace-scoped runner pattern (cwd: workspace)
  drift = detectSpecDrift({ workspace, gitRunner: driftRunner })
  if (drift) {
     result.specDrift = { status:"warning", domains: drift.domains.map(→ {domain, sinceCommit, message}) }
     line = "Deriva de especificación en: <names>. Considera ejecutar /sdd-reconcile."
     result.systemMessage = result.systemMessage ? result.systemMessage + "\n" + line : line
  }
} catch { /* drift must never break session start */ }
```

PreToolUse — **Step 5c**, inserted after the Step 5b git-collaboration block and after the `commands.length === 0` early-allow (a `git commit` always carries a command, so it is never short-circuited there), before the Step 6 ASK loop:

```
DISABLE_SPEC_DRIFT_GUARD !== "true"  AND  some command matches /\bgit\s+commit\b/i ?
try {
  drift = detectSpecDrift({ workspace: process.cwd(), gitRunner: injectedGitRunner })
  if (drift) {
     staged = readStagedFiles(injectedGitRunner) ?? []      // fallback: empty ⇒ no overlap ⇒ no fire (safe)
     hits = drift.domains.filter(d => staged.some(f => matchesGlobs(f, d.sources)))
     if (hits.length) return makeDecision("ask", "Vas a commitear con dominios derivados: <names>. Considera /sdd-reconcile antes.")
  }
} catch { /* advisory only — fall through to Step 6 */ }
```

Because Step 5 (DENY) and Step 5b run first, a DENY rule or a branch/dirty advisory still wins; 5c never blocks (always `ask`).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/ospec-state.js` | Modify | Add `detectSpecDrift`, `readStagedFiles`, `matchesGlobs` + manifest/entries parser; export all. Sync, fail-safe, shared deadline. |
| `scripts/hooks/session-start.js` | Modify | Additive `specDrift` block after git-collab, before return; `DISABLE_SPEC_DRIFT_GUARD` gate; try/catch. |
| `scripts/hooks/pre-tool-use.js` | Modify | Step 5c after 5b; import `detectSpecDrift`/`readStagedFiles`/`matchesGlobs`; bypass in the same env-gate style. |
| `agents/sdd-orchestrator.agent.md` | Modify | New `### Ambient SDD Awareness Gate (MANDATORY)` subsection immediately after `### SDD Init Guard (MANDATORY)` (line ~164); add `sdd-reconcile` to the frontmatter `agents: [...]` allowlist (line 5) so the orchestrator may dispatch it. |
| `commands/sdd-reconcile.prompt.md` | Create | Frontmatter `agent: sdd-orchestrator`, `name`/`description`, `argument-hint: "<domain or blank>"`; routes to orchestrator, mirrors `commands/sdd-baseline.prompt.md`. |
| `skills/sdd-reconcile/SKILL.md` | Create | `delegate_only: true`, `user-invocable: false` stop-sign skill (mirrors `skills/sdd-baseline/SKILL.md`); frontmatter with triggers so `discoverSkills` indexes it; orchestrator gate banner + reconcile algorithm summary, not the full executor logic. |
| `agents/sdd-reconcile.agent.md` | Create | The executor. Frontmatter mirrors `agents/sdd-baseline.agent.md` (`name`, `description`, `tools: ['read', 'search', 'edit', 'execute']`, `user-invocable: false`, `target: vscode`); body implements the `/sdd-reconcile` algorithm below and returns the standard phase result envelope. |
| `scripts/lib/ospec-state.test.js` | Modify | Unit tests for the three new exports. |
| `scripts/hooks/session-start.test.js` | Modify | `specDrift` present/absent/bypass/not-initialized. |
| `scripts/hooks/pre-tool-use.test.js` | Modify | Step 5c fire/no-overlap/deny-precedence/bypass. |
| `dist/**` | Regenerated | Gitignored; produced by `scripts/configure` — never hand-edited. |

### Orchestrator gate prose (to inject)

A MANDATORY, always-on subsection under CORE (beside the Init Guard): before any inline or delegated work, check whether the task's target files overlap (a) a non-terminal change's declared scope or (b) a specced domain's globs (from `specDrift`/`capabilities` session context). If overlap AND the task is **non-trivial**, call `AskUserQuestion` offering SDD routing *before* proceeding. Non-trivial = **(a) ≥2 files touched OR (b) introduces new logic/architecture** (new function/module or behavior change), regardless of file count. It MUST NOT fire for a single-file cosmetic change (typo, comment-only, rename, formatting, behavior-preserving one-liner). The two conditions are independent OR triggers — a 5-file cosmetic rename still fires (accepted trade-off). On decline, proceed directly and create no `openspec/` artifacts.

### `/sdd-reconcile` algorithm

1. Validate `<domain>` against `baseline.domains_done`; unknown ⇒ reject, list valid names, no writes.
2. Targets = the given domain, else every domain `detectSpecDrift` reports drifted; none drifted ⇒ no-op, no writes.
3. Per target: read last manifest hash + globs; compute `git diff --name-only <hash>..HEAD` filtered by globs (the diff window) — inspect nothing outside it.
4. Derive requirement/scenario text for the observed behavior only.
5. **Re-read** `openspec/specs/{domain}/spec.md`, merge additively (no clobber of out-of-window content).
6. On success, **append** one Entries row `| {domain} | reconciled | - | {new HEAD short hash} | {UTC} |` to `manifest.md` (never edit prior rows). Failure before any write ⇒ no row appended, drift status unchanged.

## Testing Strategy (strict_tdd: true — tests first)

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (`ospec-state.test.js`) | Domain drifted / only-out-of-scope / active-change suppression / git-failure fail-safe / `sources:` parsed from manifest / latest-row-wins / `matchesGlobs` `**`&`*` / `readStagedFiles` | Temp `openspec/` fixture (config + manifest) + injected `gitRunner` stub keyed on `diff`/`--cached` args |
| Unit (`session-start.test.js`) | `specDrift` present (warning + names in `systemMessage`); absent when none drift; absent under `DISABLE_SPEC_DRIFT_GUARD`; not run when openspec absent | Extend `createFixture` with a manifest; reuse `makeSessionGitRunner` stub |
| Unit (`pre-tool-use.test.js`) | 5c fires on staged∩drift; silent on no overlap; DENY precedence; bypass; ordering after 5b | Extend `gitGuardDecision`/`makeGitStubRunner` to answer `--cached` + `diff` |
| Generation/validation | New command+skill frontmatter valid; skill discoverable | Covered by `npm test` (`scripts/check.js`) generating all 4 targets |

## Migration / Rollout

No data migration. Pure additive behavior behind a default-on guard with `DISABLE_SPEC_DRIFT_GUARD=true` as an instant kill switch; full rollback reverts the additive blocks and deletes the two new files. Source of truth is `scripts/`/`agents/`/`skills/`; `dist/` is **gitignored** (`.gitignore:12`) and never committed — `npm test` (`node scripts/check.js`) self-generates and validates all four targets in temp dirs, so no `dist/` regeneration or hand-edit is required for apply/verify.

## Open Questions

None remaining. The only open item (whether `agents/sdd-reconcile.agent.md` was needed) is resolved: yes, required — see the "Reconcile ships as the full triplet" Architecture Decision above.
