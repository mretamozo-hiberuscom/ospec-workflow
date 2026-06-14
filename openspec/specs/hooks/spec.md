# Spec: hooks

## Domain
Runtime lifecycle event hooks — registration, dispatch, and per-event handler behaviour.

## Scope
Five Claude lifecycle hooks are registered in `hooks/hooks.json` and implemented in
`scripts/hooks/`. Each hook runs as a standalone Node.js 22+ CommonJS script invoked
by the Claude host process. Hooks read a JSON payload from stdin and write a JSON
response to stdout. Support logic lives in `scripts/lib/ospec-state.js` and
`scripts/lib/artifact-store.js`.

---

## 1. Hook Registration

### 1.1 Registration file
`hooks/hooks.json` is the single source of truth for hook binding. It MUST list all
five lifecycle events under the top-level `hooks` key.

### 1.2 Registered events and scripts

| Event | Script | Timeout |
|---|---|---|
| `SessionStart` | `scripts/hooks/session-start.js` | none |
| `PreToolUse` | `scripts/hooks/pre-tool-use.js` | 5 s |
| `PreCompact` | `scripts/hooks/pre-compact.js` | 5 s |
| `SubagentStop` | `scripts/hooks/subagent-stop.js` | 5 s |
| `Stop` | `scripts/hooks/stop.js` | 5 s |

All entries are of type `"command"`. The host resolves the plugin root via the
`CLAUDE_PLUGIN_ROOT` environment variable, so the command template is
`node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js"`.

### 1.3 Stdin / stdout contract
Every hook MUST:
- Read its input payload as UTF-8 JSON from stdin (empty stdin resolves to `{}`).
- Write exactly one UTF-8 JSON line to stdout before exiting.
- Never crash silently; errors MUST produce a valid JSON stdout line.

---

## 2. SessionStart

**Trigger**: Claude session initialization, before any agent turn.

**Source**: `scripts/hooks/session-start.js`

### 2.1 Behaviour

Given a Claude session starts in a workspace directory,
When the hook runs,
Then it MUST:

1. Resolve the workspace from `input.cwd` if supplied; otherwise use `process.cwd()`.
2. Create an `ArtifactStore` from `openspec/config.yaml` (detecting `openspec` or
   `workspace-federated` backend).
3. Check whether openspec is initialized:
   - **openspec mode**: `openspec/config.yaml` exists.
   - **workspace-federated mode**: `openspec/workspace.yaml` exists and has at least
     one member.

Given openspec is NOT detected,
When the hook runs,
Then it MUST return:
```json
{
  "status": "ok",
  "ospecDetected": false,
  "registry": { "status": "skipped", "path": ".ospec/cache/skill-registry.cache.json" }
}
```
and MUST NOT write any file under `.ospec/`.

Given openspec IS detected,
When the hook runs,
Then it MUST:

1. Read `openspec/config.yaml` and extract the `baseline` block via `readBaselineState`.
   Errors reading baseline MUST be swallowed; a failure here MUST NOT abort session start.
2. Compute a baseline hint (see §2.2) and attach it to the result if non-null.
3. Discover all skills from the plugin root (`skills/**/*.md`, `rules/**/*.md`) using
   `discoverSkills`.
4. Compute a SHA-256 fingerprint over the fingerprint paths from step 3.
5. Read the existing cache at `.ospec/cache/skill-registry.cache.json`.
6. If the cache exists, has `version === 2`, and its `fingerprint` matches the computed
   value: report `status: "reused"` and MUST NOT rewrite the cache.
7. If the cache is absent or stale: write a new cache object (see §2.3) and report
   `status: "generated"`.
8. For `workspace-federated` mode: federate the workspace shape (members + contracts,
   sorted by `id`) into the `cache.workspace` field.
9. Return:
   ```json
   {
     "status": "ok",
     "ospecDetected": true,
     "registry": { "status": "generated|reused", "path": ".ospec/cache/skill-registry.cache.json" }
   }
   ```
   (plus `"baseline": { "hint": "..." }` when a hint is present).

### 2.2 Baseline hint logic

| `baseline.status` | `stale_domains` | Hint produced |
|---|---|---|
| `"pending"` | any | "Baseline not started. Run /sdd-baseline to seed openspec/specs/." |
| `"partial"` | any | "Baseline partial: N domain(s) pending. Run /sdd-baseline to resume." |
| `"done"` | non-empty | "Baseline done but N domain(s) stale: {list}. Run /sdd-baseline refresh to update." |
| `"done"` | empty | `null` — key omitted from result |
| config has no `baseline` block | — | `null` — key omitted from result |

### 2.3 Registry cache schema (v2)

```json
{
  "version": 2,
  "fingerprint": "sha256:<64 hex chars>",
  "generated_at": "<ISO 8601 UTC>",
  "skills": [
    {
      "id": "<skill-name>",
      "path": "skills/<name>/SKILL.md",
      "triggers": ["<trigger word>", "..."],
      "compact_rules": ["<rule text>", "..."]
    }
  ],
  "workspace": { "members": [...], "contracts": [...] }
}
```

The `workspace` key is present only in `workspace-federated` mode. In `openspec` mode it
MUST be absent.

### 2.4 Error handling
On any unhandled error the hook MUST write `{"status":"error","message":"<msg>"}` to
stdout and set `process.exitCode = 1`.

---

## 3. PreToolUse

**Trigger**: before every tool call Claude attempts to make.

**Source**: `scripts/hooks/pre-tool-use.js`

### 3.1 Behaviour

Given a tool call is about to execute,
When the hook receives `{tool_name, tool_input}`,
Then it MUST evaluate the call and return:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "<human-readable string>"
  }
}
```

### 3.2 Command extraction

The hook MUST extract candidate commands from `tool_input` as follows:
- If `tool_input.command` is a string: treat it as one command.
- If `tool_input.commands` is an array: treat each element that is a string or has a
  `.command` string property as a command.
- Null, undefined, non-array, and non-string elements are silently skipped.

If no commands are extracted (regardless of whether the tool is a shell tool): return
`allow`.

### 3.3 Shell tool recognition

A tool is considered a shell tool when its normalized name (non-alphanumeric chars
stripped, lower-cased) matches any of:
`runcommand`, `runinterminal`, `runterminalcommand`, `shell`, `shellcommand`, `terminal`.

Shell tool status does NOT change the allow/deny/ask outcome — it is used only for
diagnostic context in log messages. Command inspection applies to all tool types.

### 3.4 Decision rules

Evaluation MUST proceed in this order; the first match wins:

**Step 1 — DENY (no recovery).** Test each extracted command against every deny rule.
If any command matches any deny rule: return `deny` with the matching rule's reason.

| Pattern intent | Example |
|---|---|
| Recursive forced deletion of filesystem root | `rm -rf / --no-preserve-root`, `sudo rm -fr /` |
| Force-push git history | `git push --force`, `git push -f` |
| Pipe download to shell | `curl ... \| bash`, `wget ... \| sudo sh` |
| Pipe download to PowerShell eval | `iwr ... \| iex`, `Invoke-RestMethod ... \| Invoke-Expression` |
| Drive-root recursive forced deletion (Windows) | `Remove-Item C:\\ -Recurse -Force` |
| Filesystem format | `mkfs.ext4 /dev/sda1` |
| Raw write to block device | `dd if=image.iso of=/dev/sda` |
| Format or clear a disk | `Clear-Disk -Number 0`, `format C:` |

**Step 2 — ASK (requires user confirmation).** Test each extracted command against
every ask rule. If any command matches any ask rule: return `ask` with the matching
rule's reason.

| Pattern intent | Example |
|---|---|
| Dependency installation | `npm install`, `pnpm add lodash`, `yarn install`, `bun install` |
| Hard git reset | `git reset --hard HEAD~1` |
| Git clean (forced) | `git clean -fd` |
| Docker Compose teardown | `docker compose down`, `docker-compose down --volumes` |
| Recursive forced deletion (non-root) | `rm -rf ./dist` |
| Recursive permission/ownership change | `chmod -R 777 ./data`, `chown --recursive user:group .` |
| PowerShell recursive forced removal (non-drive-root) | `Remove-Item ./dist -Recurse -Force` |
| Recursive dir deletion (Windows cmd) | `rmdir /s build` |
| Force-push with lease | `git push --force-with-lease` |
| Machine restart or shutdown | `shutdown -h now`, `reboot`, `Restart-Computer` |

**Step 3 — ALLOW.** Return `allow`.

**Deny beats ask**: When a command sequence matches both a deny rule and an ask rule
(in separate commands in the array), `deny` MUST win.

### 3.5 Error handling
On any parse or evaluation error: return `ask` with a message explaining why the hook
could not inspect the call. The hook MUST NOT crash or exit non-zero.

---

## 4. PreCompact

**Trigger**: before Claude compacts its conversation context.

**Source**: `scripts/hooks/pre-compact.js`

### 4.1 Behaviour

Given a context compaction is about to occur,
When the hook runs,
Then it MUST always write `{"continue":true}` to stdout (errors include a
`systemMessage` key but still set `continue: true`) and MUST NOT block compaction.

Given no active change exists in the workspace,
When the hook runs,
Then it MUST return `{status: "skipped", reason: "no-active-change"}` internally and
MUST NOT create any `.ospec/` files.

Given an active change exists,
When the hook runs,
Then it MUST:
1. Extract fields from the active change's `state.yaml` (see §4.2).
2. Infer the last completed artifact (see §4.3).
3. Render the session summary document (see §4.4).
4. Write (or no-op if content is unchanged) to
   `.ospec/session/{changeName}/session-summary.md`.
5. Return `{status: "written"|"fresh", change: "<name>", path: ".ospec/session/..."}`.

### 4.2 Active change selection

The hook delegates to `ArtifactStore.findActiveChanges()`, which:
- Scans `openspec/changes/*/state.yaml` (single-repo) or member workspace changes
  (federated).
- Excludes directories named `archive` and changes whose `status` field (from
  `change.status` or top-level `status`) matches: `archived`, `closed`, `complete`,
  `completed`, `done`.
- Sorts remaining changes by `state.yaml` modification time descending; ties broken
  alphabetically by directory name.
- Returns the first (most recently modified) non-terminal change.

### 4.3 YAML extraction (no external parser)

`state.yaml` is parsed by a built-in line-based extractor that handles:
- Indented key–value pairs up to two levels deep.
- Quoted and unquoted scalar values; inline comments stripped.
- YAML list items (`- value` or `- key: value`).
- Inline empty lists (`key: []`).

Fields extracted and their YAML paths (first match wins):

| Field | YAML paths tried |
|---|---|
| Change name | `change.name` → directory name fallback |
| Current phase | `change.current_phase`, `current_phase`, `phase` |
| Explicit artifact | `runtime.last_completed_artifact`, `last_completed_artifact` |
| Blockers | `blocking_questions[]` or `blockers[]` |
| Approvals | `approvals[]` (objects with `gate`/`id` and `decision`/`status`) |
| Next recommended | `next_recommended` |

### 4.4 Last completed artifact inference

If `runtime.last_completed_artifact` or `last_completed_artifact` is set in `state.yaml`:
that value is used as-is (portable path).

Otherwise, the hook scores candidate files by phase rank:

| Rank | Files |
|---|---|
| 1 | `exploration.md` |
| 2 | `proposal-lite.md`, `proposal.md` |
| 3 | `design.md`, `specs/**/spec.md` |
| 4 | `tasks.md` |
| 5 | `apply-progress.md` |
| 6 | `verify-report.md` |
| 7 | `archive-report.md` |

The hook selects the file with the highest rank that:
- Exists on disk under the active change directory.
- Has a rank strictly less than the current phase rank (i.e., is already completed).

If no candidate file exists: returns `"None"`.

### 4.5 Session summary format

```markdown
# Session Summary

## Active change
`{changeName}`

## Current phase
`{currentPhase | "unknown"}`

## Last completed artifact
`{lastCompletedArtifact}`

## Blocking decisions
- {blocker1}
- None  ← when list is empty

## Approvals
- {gate}: {decision}
- None  ← when list is empty

## Next recommended action
Run `{phase} {changeName}`.   ← or free-text from next_recommended
```

### 4.6 Idempotency
The hook MUST use an atomic write (temp file + `fs.rename`) for `session-summary.md`.
If the file already exists and content is identical: skip the write and return
`status: "fresh"`.

---

## 5. SubagentStop

**Trigger**: when a Claude subagent finishes (after each delegated turn).

**Source**: `scripts/hooks/subagent-stop.js`

### 5.1 Behaviour

Given a subagent has finished,
When the hook receives its result payload,
Then it MUST extract the `skill_resolution` value from the payload (see §5.2).

Given `skill_resolution` is healthy (`"injected"`),
When the hook evaluates it,
Then it MUST return `{status: "skipped", reason: "healthy-resolution"}` and write no
file; output `{"continue":true}`.

Given `skill_resolution` is unavailable (not found in any field),
When the hook evaluates it,
Then it MUST return `{status: "skipped", reason: "resolution-unavailable"}` and write
no file; output `{"continue":true}`.

Given `skill_resolution` is degraded (`"fallback-registry"`, `"fallback-path"`, or
`"none"`),
When the hook evaluates it,
Then it MUST:
1. Build an event object:
   ```json
   {
     "timestamp": "<input.timestamp or now().toISOString()>",
     "agent": "<agent_type | agent_name | agent | agent_id | 'unknown'>",
     "skill_resolution": "<degraded value>",
     "action": "refresh-registry-next-delegation"
   }
   ```
2. Append the serialized event (one JSON line) to
   `.ospec/runtime/subagent-events.jsonl` under an advisory file lock.
3. Output `{"continue":true,"systemMessage":"Subagent skill resolution degraded; refresh the skill registry before the next delegation."}`.

### 5.2 Resolution extraction order

The hook MUST search for `skill_resolution` in this priority order:
1. `input.skill_resolution` directly (string field).
2. Known result fields on `input` in order: `result`, `output`, `response`,
   `final_output`, `final_result`, `message`, `content`. Each field is searched as:
   - If the value is a string: regex match for `skill_resolution: "value"` or JSON parse
     + structured search.
   - If the value is an object/array: recursive `skill_resolution` key search
     (depth-first, reversed-values to find the last occurrence).
3. `input.transcript_path`: read the JSONL file, parse each line from the last line
   backward, and apply the structured search to each parsed JSON object.

### 5.3 Advisory append lock

Appends to `.ospec/runtime/subagent-events.jsonl` MUST use an exclusive-create lock
file (`.ospec/runtime/subagent-events.jsonl.lock`) to prevent interleaved JSONL lines
from concurrent subagent hook invocations.

Lock acquisition protocol:
- Attempt to create the lock file with `open("wx")`.
- If the lock exists: check its modification time; if older than 10 seconds (stale
  process crash), delete it and retry.
- Retry up to 100 times with 15 ms delay between attempts.
- After 100 retries still contended: proceed without the lock (best-effort) rather
  than lose the event.
- Release: close the handle and delete the lock file.

### 5.4 Error handling
Any unhandled error MUST produce `{"continue":true,"systemMessage":"SubagentStop observability failed: <msg>"}`. The hook MUST NOT exit non-zero or suppress `continue: true`.

---

## 6. Stop

**Trigger**: when a Claude session ends.

**Source**: `scripts/hooks/stop.js`

### 6.1 Behaviour

Given a Claude session is ending,
When the hook runs,
Then it MUST:
1. Resolve workspace from `input.cwd` or `process.cwd()`.
2. Find the active change using the same selection logic as PreCompact (§4.2).
3. If an active change exists: extract its name, current phase, status, and
   `next_recommended` from `state.yaml`.
4. Check whether `.ospec/session/{changeName}/session-summary.md` exists (written by
   PreCompact).
5. Render the latest-session document (see §6.2).
6. Write the document to `.ospec/session/latest.md` (always overwrite; no
   idempotency check).
7. Output `{"continue":true}` to stdout.

Given no active change exists when Stop fires,
When the hook renders the latest-session document,
Then all change-related fields MUST be `"None"` and next action MUST read
"Start a new session when more work is needed."

Given the session has a terminal-status change (completed, archived, etc.) but no
other active change,
When the hook evaluates active changes,
Then it MUST treat the workspace as having no active change.

### 6.2 Latest-session document format

```markdown
# Latest Session

- Ended at: `{timestamp}`
- Session: `{sessionId}`
- Active change: `{changeName | "None"}`
- Current phase: `{currentPhase | "unknown" | "None"}`
- Change status: `{status | "active" | "None"}`
- Detailed summary: `{relative path to session-summary.md | "None"}`

## Next recommended action
{formatted next action}
```

`sessionId` is resolved from `input.sessionId` or `input.session_id`; defaults to
`"unknown"`. Timestamp uses `input.timestamp` if supplied; otherwise
`now().toISOString()`.

`Detailed summary` is set to the portable relative path of
`.ospec/session/{changeName}/session-summary.md` if that file exists; otherwise
`"None"`.

### 6.3 Error handling
On any unhandled error: output `{"continue":true,"systemMessage":"Stop hook could not write the session trace: <msg>"}`. The hook MUST NOT exit non-zero.

---

## 7. On-disk artifact layout

All hooks resolve paths through `ArtifactStore`; no hook hardcodes `.ospec/` layout
literals directly.

| File | Owner | Write mode |
|---|---|---|
| `.ospec/cache/skill-registry.cache.json` | SessionStart | Create or overwrite (only on fingerprint miss) |
| `.ospec/session/{changeName}/session-summary.md` | PreCompact | Atomic write; no-op if unchanged |
| `.ospec/session/latest.md` | Stop | Always overwrite |
| `.ospec/runtime/subagent-events.jsonl` | SubagentStop | Append (advisory lock) |

### 7.1 Initialization guard
SessionStart and SubagentStop MUST NOT create `.ospec/` files unless openspec is
detected in the workspace. PreCompact and Stop MAY create `.ospec/` paths only when
an active change exists. If no active change is found, neither hook writes any file.

---

## 8. Support library responsibilities

| Library | Responsibilities used by hooks |
|---|---|
| `scripts/lib/ospec-state.js` | `readBaselineState`, `findActiveChanges`, `writeSessionSummary`, `appendRuntimeEvent`, `findOpenSpecRoot` |
| `scripts/lib/artifact-store.js` | `createArtifactStoreFromConfig`, `ARTIFACT_STORE_RELATIVE_PATHS` (canonical path constants) |
| `scripts/lib/skill-registry.js` | `discoverSkills`, `calculateFingerprint`, `readRegistryCache`, `writeRegistryCache` |
| `scripts/lib/workspace-atlas.js` | `parseAtlas`, `resolveMembers` (federated backend only) |

---

## 9. Non-functional requirements

- All hooks MUST be pure Node.js 22+ CommonJS with no external npm dependencies.
- All hooks MUST complete within 5 seconds (PreToolUse, PreCompact, SubagentStop,
  Stop); SessionStart has no declared timeout.
- All hooks MUST be non-blocking to the Claude host: they output `{"continue":true}`
  or a permission decision and MUST NOT hang.
- All hooks MUST tolerate a completely missing or malformed `openspec/` tree without
  throwing.

---

## 10. Scenarios

### Scenario: SessionStart with stale skill registry
Given a workspace with `openspec/config.yaml` and an outdated cache
And a `rules/common.md` file has been modified since the cache was written
When SessionStart runs
Then the fingerprint comparison MUST fail
And a new cache MUST be written with updated `generated_at` and new `fingerprint`
And the result MUST include `registry.status: "generated"`

### Scenario: SessionStart with unchanged skills
Given a workspace with a current cache matching the fingerprint
When SessionStart runs a second time
Then the cache file MUST NOT be modified
And the result MUST include `registry.status: "reused"`

### Scenario: PreToolUse deny beats ask in a command array
Given a tool call with `commands: ["npm install", "rm -rf /"]`
When PreToolUse evaluates the array
Then DENY_RULES MUST be evaluated first across all commands
And the result MUST be `permissionDecision: "deny"`

### Scenario: PreCompact with no active change
Given a workspace where all changes have status `"completed"`
When PreCompact runs
Then it MUST return `{status: "skipped", reason: "no-active-change"}`
And MUST NOT create `.ospec/session/`

### Scenario: SubagentStop records a degraded fallback-registry event
Given a subagent result payload with `skill_resolution: "fallback-registry"`
When SubagentStop runs
Then it MUST append one JSON line to `.ospec/runtime/subagent-events.jsonl`
And the event MUST contain `"action": "refresh-registry-next-delegation"`
And stdout MUST contain a `systemMessage` advising registry refresh

### Scenario: Stop with no active change
Given a workspace with no active changes
When Stop runs
Then it MUST write `.ospec/session/latest.md` with all change fields set to `"None"`
And next action MUST read "Start a new session when more work is needed."
