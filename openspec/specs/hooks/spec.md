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

## 1.4 Domain Drift Detection Helper

`scripts/lib/ospec-state.js` MUST expose a domain-drift helper that, given a baseline domain's recorded manifest commit hash (from `openspec/specs/_baseline/manifest.md`'s Entries table) and that domain's source globs (from the manifest Domain Map), determines whether the domain has drifted since that hash.

The helper MUST:
- Compare `git diff --name-only <hash>..HEAD`, filtered by the domain's source globs; a non-empty filtered result means the domain is drifted.
- Resolve each domain's source globs by parsing the existing `sources: ...` list already present in that domain's Domain Map bullet in `openspec/specs/_baseline/manifest.md` (format: `- {domain}: {description} | sources: {glob1}, {glob2}, ...`) — split on `,` after the `sources:` marker, trim whitespace per entry. No new manifest field or schema change is required; all 7 recorded domains already carry this list.
- Exclude a domain from the drifted result when any currently active (non-terminal) OpenSpec change's declared scope already covers that domain — an active change already tracks it.
- Run all git probes inside a single shared timeout budget, mirroring the 5 s deadline pattern used by `resolveGitState` in `scripts/hooks/lib/git-state.js`.
- Fail-safe on any git failure (missing hash, empty repo, detached HEAD, missing git binary, non-zero exit): return "no drift data" for the affected domain rather than throwing. Callers (SessionStart, PreToolUse) MUST NOT crash or block on this failure.

### Scenarios

- **Domain has in-scope changes since hash — drifted**: GIVEN domain `hooks` was last recorded at commit `59fbfe8` AND `git diff --name-only 59fbfe8..HEAD` includes a file matching the `hooks` domain's source globs WHEN the drift helper evaluates `hooks` THEN it MUST report `hooks` as drifted
- **Domain has only out-of-scope changes — not drifted**: GIVEN `git diff --name-only <hash>..HEAD` returns files, none of which match the domain's source globs WHEN the drift helper evaluates the domain THEN it MUST report the domain as NOT drifted
- **Drift covered by an active change's declared scope — suppressed**: GIVEN a domain has in-scope changes since its recorded hash AND an active (non-terminal) OpenSpec change's declared file scope already covers that domain WHEN the drift helper evaluates the domain THEN it MUST NOT report the domain as drifted
- **git failure — fail-safe, no throw**: GIVEN the recorded hash no longer exists in history, OR git is not installed, OR the repository is empty/detached WHEN the drift helper evaluates any domain THEN it MUST return "no drift data" for that domain and MUST NOT throw or abort the calling hook
- **Source globs resolved from the existing manifest Domain Map — no new field required**: GIVEN `openspec/specs/_baseline/manifest.md`'s Domain Map already lists `sources: scripts/hooks/*.js, hooks/hooks.json, scripts/lib/ospec-state.js, scripts/lib/artifact-store.js, scripts/lib/workspace-atlas.js` for the `hooks` domain WHEN the drift helper resolves source globs for `hooks` THEN it MUST parse that existing `sources:` list (split on `,`, trimmed) as the domain's glob set AND it MUST NOT require any additional manifest field, file, or explicit glob-mapping to be introduced

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
9. **AGENT SHIELD SECURITY CHECK**:
   Si la variable de entorno `DISABLE_AGENT_SHIELD=true` no está activa, el hook MUST escanear el espacio de trabajo en busca de riesgos de seguridad y adjuntar los resultados en la propiedad `security` de la respuesta JSON:
   - Verificar si archivos como `.env`, `.env.local` y `.npmrc` existen y no están incluidos en `.gitignore`.
   - Verificar si el archivo `.git/config` contiene credenciales incrustadas (patrón `https://[^:]+:[^@]+@`).
10. Return:
    ```json
    {
      "status": "ok",
      "ospecDetected": true,
      "registry": { "status": "generated|reused", "path": ".ospec/cache/skill-registry.cache.json" },
      "security": {
        "status": "warning" | "ok",
        "alerts": [
          {
            "type": "unignored-env-file" | "embedded-credentials",
            "file": ".env" | ".git/config",
            "reason": "El archivo sensible no está ignorado en Git" | "El archivo contiene credenciales en texto plano"
          }
        ]
      }
    }
    ```
    (plus `"baseline": { "hint": "..." }` when a hint is present, and `"systemMessage": "..."` containing warnings when `security.status === "warning"`).

### 2.1a Git Collaboration Advisory

After the security check (Step 9 above), the hook MUST run a git collaboration check when openspec is detected. The check evaluates TWO independent conditions: (1) whether the current branch equals the default branch, and (2) whether the working tree is dirty (`git status --porcelain` returns non-empty output). When at least one condition holds, the hook MUST include a `gitCollaboration` entry in the response JSON.

The check MUST be guarded by `DISABLE_GIT_COLLABORATION_GUARD !== "true"`; when the bypass is active, the entire check is skipped (no `gitCollaboration` key, no change to `systemMessage`).

**Response schema** (`status: "warning"` when at least one condition holds, omitted entirely when both are absent):

```json
{
  "gitCollaboration": {
    "status": "warning",
    "currentBranch": "<name>",
    "defaultBranch": "<name>",
    "dirtyTree": true,
    "message": "<human-readable advisory>"
  }
}
```

Field rules:
- `currentBranch`: always the resolved current branch name; `null` if unresolvable.
- `defaultBranch`: always the resolved default branch name; `null` if unresolvable.
- `dirtyTree`: `true` when `git status --porcelain` is non-empty; `false` when clean; **omitted if `git status` fails** (never falsely reported clean).
- `message`: content follows the same rules as the PreToolUse advisory (single message, combined if both conditions).

The advisory MUST also be appended to the existing `systemMessage` string (newline-separated) so the Claude host surfaces it to the user at session start.

When git is unavailable or any git command fails, the affected condition MUST be silently skipped; the remaining check MUST still run. The rest of SessionStart behavior (registry cache, baseline hint, security) MUST be unaffected.

#### Scenarios

- **Session on default branch, clean tree — default-branch advisory**: Given `origin/HEAD → refs/remotes/origin/main`, current branch `main`, clean working tree, When SessionStart runs, Then the response MUST include `gitCollaboration.status: "warning"` with `dirtyTree: false` AND `systemMessage` MUST mention "default branch" and "feature branch".
- **Session on feature branch, dirty tree — dirty-tree advisory**: Given current branch is `feat/my-feature` AND `git status --porcelain` returns non-empty output, When SessionStart runs, Then the response MUST include `gitCollaboration.status: "warning"` with `dirtyTree: true` AND `systemMessage` MUST mention "uncommitted changes".
- **Session on default branch AND dirty tree — combined advisory**: Given current branch is `main` (default) AND working tree is dirty, When SessionStart runs, Then the response MUST include exactly one `gitCollaboration` entry with `dirtyTree: true` AND `message` MUST mention both "default branch" and "uncommitted changes".
- **Session on feature branch, clean tree — no advisory**: Given current branch is `feat/my-feature` AND working tree is clean, When SessionStart runs, Then the response MUST NOT contain a `gitCollaboration` key AND `systemMessage` MUST NOT include any collaboration advisory text.
- **Bypass active — advisory suppressed**: Given `DISABLE_GIT_COLLABORATION_GUARD=true`, When SessionStart runs regardless of branch or working tree state, Then no `gitCollaboration` key is present in the response AND `systemMessage` is unaffected by this guard.
- **git unavailable — advisory silently omitted**: Given git is not installed or not on PATH, When SessionStart runs, Then the entire collaboration check is silently skipped AND registry cache, baseline hint, and security check behavior MUST be unaffected.
- **git status fails, branch check succeeds — partial advisory**: Given `git branch --show-current` returns `main` (= default branch) AND `git status --porcelain` exits non-zero, When SessionStart runs, Then the `gitCollaboration` entry MUST reflect the default-branch condition AND the `dirtyTree` field MUST be omitted (not falsely reported as clean).

### 2.1b Spec Drift Summary

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

#### Scenarios

- **Domains drifted — summary present**: GIVEN two domains report drifted from the domain-drift helper AND `DISABLE_SPEC_DRIFT_GUARD` is unset WHEN SessionStart runs THEN the response MUST include `specDrift.status: "warning"` listing both domains AND `systemMessage` MUST include a line naming both domains
- **No domain drifted — field omitted**: GIVEN the domain-drift helper reports zero drifted domains WHEN SessionStart runs THEN the response MUST NOT contain a `specDrift` key at all
- **Guard disabled — field omitted regardless of drift**: GIVEN `DISABLE_SPEC_DRIFT_GUARD=true` AND at least one domain would otherwise report drifted WHEN SessionStart runs THEN no `specDrift` key is present in the response AND no drift computation side effects (no file writes) occur
- **openspec not initialized — no drift check runs**: GIVEN `openspec/config.yaml` is absent WHEN SessionStart runs THEN the existing early-return path applies (§2.1) and the drift check MUST NOT run

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

(Previously: Evaluaba los comandos de terminal en busca de reglas de DENY y ASK. Ahora incorpora además las validaciones de límites de tokens del Token Budget Advisor).

### 3.2 Command extraction

The hook MUST extract candidate commands from `tool_input` as follows:
- If `tool_input.command` is a string: treat it as one command.
- If `tool_input.commands` is an array: treat each element that is a string or has a
  `.command` string property as a command.
- Null, undefined, non-array, and non-string elements are silently skipped.

If no commands are extracted (regardless of whether the tool is a shell tool): return
`allow` (a menos que se disparen las alertas de lectura pesada de archivos descritas en §3.6).

### 3.3 Shell tool recognition

A tool is considered a shell tool when its normalized name (non-alphanumeric chars
stripped, lower-cased) matches any of:
`runcommand`, `runinterminal`, `runterminalcommand`, `shell`, `shellcommand`, `terminal`.

Shell tool status does NOT change the allow/deny/ask outcome — it is used only for
diagnostic context in log messages. Command inspection applies to all tool types.

### 3.4 Decision rules

Evaluation MUST proceed in this order; the first match wins:

**Step 1 — BYPASS (Bypasses de Advisors).**
- Si la variable de entorno `DISABLE_TOKEN_ADVISOR=true` está activa: se omiten los Pasos 3 y 4 del Advisor de Tokens.
- Si la variable de entorno `DISABLE_AGENT_SHIELD=true` está activa: se omiten las validaciones de AgentShield descritas en el Paso 2.
- Si la variable de entorno `DISABLE_GIT_COLLABORATION_GUARD=true` está activa: se omite el Paso 5b (Git Collaboration Guard).
- Si la variable de entorno `DISABLE_SPEC_DRIFT_GUARD=true` está activa: se omite el Paso 5c (Spec Drift Advisory).

**Step 2 — AGENT SHIELD SECURITY (Protección contra Fuga de Secretos).**
Si el agente intenta leer un archivo (herramientas como `view_file` o lectura de URLs/recursos) y el archivo solicitado es sensible:
- Si es una clave privada SSH (`id_rsa`, `id_ecdsa`, `id_ed25519`), `.git/config` o `.npmrc`, retornar `deny` con la razón: *"Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente."*
- Si es `.env`, `.env.*`, `secrets.json`, `credentials` o archivos que contienen secretos detectados heurísticamente (como contraseñas fuertes o tokens de API usando expresiones regulares) en archivos de texto de tamaño inferior a 1MB, retornar `ask` con la razón: *"Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?"*

**Step 3 — TOKEN BUDGET ADVISOR (Lectura Pesada).**
Si la herramienta lee archivos (como `view_file` o lectura de recurso) y el archivo tiene un tamaño de caracteres estimado superior a **80,000 caracteres** (equivalente heurístico a 20,000 tokens): el hook MUST retornar `ask` advirtiendo sobre el costo de lectura del archivo y requiriendo confirmación.

**Step 4 — SESSION TOKENS (Contexto Saturado).**
Si la sesión acumulada de tokens leídos (obtenida del histórico de eventos `.ospec/runtime/subagent-events.jsonl` o de la memoria de sesión) excede los **90,000 tokens** acumulados: el hook MUST retornar `ask` alertando al usuario de la inminente saturación de contexto y sugiriendo la compactación.

**Step 5 — DENY (no recovery).** Test cada comando extraído contra las reglas de denegación.
Si algún comando coincide con una regla de denegación: retornar `deny` con la razón correspondiente.

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

**Step 5b — GIT COLLABORATION GUARD.** Detecta estados git riesgosos durante el desarrollo y advierte al usuario antes de permitir operaciones potencialmente peligrosas. Full guard logic is specified in the `git-collaboration-guard` domain spec. The guard:
- Resolves the current branch, default branch (via `origin/HEAD`), and working tree state (via `git status --porcelain`)
- Evaluates whether the tool is a risky action: a file-write tool OR a command matching `\bgit\s+commit\b`
- Fires when the risky action coincides with at least one of: (1) current branch = default branch, (2) working tree has uncommitted changes
- Returns exactly one `ask` response when both conditions hold (combined advisory)
- Returns `allow` if no conditions hold or the action is not risky
- Per-check fail-open: failure to resolve one condition does not suppress evaluation of others
- All three git commands share a single 5s timeout budget (shared deadline)
- When `DISABLE_GIT_COLLABORATION_GUARD=true`, the entire guard is skipped before any git call

Advisories are in Spanish with three variants: default-branch-only, dirty-tree-only, and combined. The `permissionDecisionReason` MUST contain the current branch name, "default branch", and/or "uncommitted changes" as applicable, plus recommendations to create a feature branch or commit/stash changes.

#### Scenarios

- **DENY fires — guard not evaluated**: Given a tool call matching a DENY rule (Step 5), When PreToolUse evaluates, Then the hook returns `deny` at Step 5, AND Step 5b is never invoked.
- **DENY does not fire, guard fires on default branch**: Given no DENY match AND tool is file-write AND current branch = default branch, When PreToolUse evaluates, Then Step 5b returns `ask` with default-branch advisory.
- **DENY does not fire, guard fires on dirty working tree**: Given no DENY match AND tool is file-write AND working tree is dirty (even on a feature branch), When PreToolUse evaluates, Then Step 5b returns `ask` with dirty-tree advisory.
- **Guard silent on clean feature branch**: Given current branch ≠ default branch AND working tree is clean AND tool is file-write, When PreToolUse evaluates, Then Step 5b returns `allow` (no advisory).
- **Bypass active — guard skipped**: Given `DISABLE_GIT_COLLABORATION_GUARD=true`, When PreToolUse evaluates, Then Step 5b is skipped and evaluation proceeds to Step 6.

**Step 5c — SPEC DRIFT ADVISORY.** The `PreToolUse` decision chain MUST include a new evaluation step for the spec-drift advisory, inserted after the git collaboration guard (Step 5b) and before the existing ASK rules (Step 6).

Step 5c fires when: the command matches `\bgit\s+commit\b`, AND the domain-drift helper (independently invoked by this hook, since hooks are stateless per-invocation processes — no state is shared with SessionStart) reports at least one drifted domain whose source globs overlap the staged files (`git diff --name-only --cached`), or — best-effort, when staged-file resolution fails — the command's target files. When it fires, the hook MUST return `ask` (never `deny`) with a reason string naming the drifted domain(s).

Step 1 BYPASS MUST recognize `DISABLE_SPEC_DRIFT_GUARD=true` and skip Step 5c entirely when active (existing bypass variables `DISABLE_AGENT_SHIELD`, `DISABLE_TOKEN_ADVISOR`, `DISABLE_GIT_COLLABORATION_GUARD` are unaffected).

Because Step 5 (DENY) executes before Step 5c, a matching DENY rule always wins — the advisory is never reached when a command is denied.

#### Scenarios

- **Staged files overlap a drifted domain — ask fires**: GIVEN a `git commit` command AND staged files include a file matching the `hooks` domain's source globs AND the `hooks` domain is currently drifted WHEN PreToolUse evaluates the call THEN Step 5c MUST return `ask` with a reason naming `hooks`
- **No overlap — advisory does not fire**: GIVEN a `git commit` command AND staged files do not overlap any drifted domain's globs WHEN PreToolUse evaluates the call THEN Step 5c MUST NOT fire and evaluation proceeds to Step 6
- **DENY fires first — advisory never evaluated**: GIVEN a tool call matches a DENY rule (Step 5) WHEN PreToolUse evaluates the call THEN the hook returns `deny` at Step 5 AND Step 5c is never invoked
- **Bypass active — advisory skipped, no residual state**: GIVEN `DISABLE_SPEC_DRIFT_GUARD=true` WHEN PreToolUse evaluates a `git commit` command that would otherwise trigger Step 5c THEN Step 5c is skipped entirely AND no drift computation occurs and no file or state is written as a side effect

---

**Step 6 — ASK (requires user confirmation).** Test cada comando extraído contra las reglas de consulta.
Si algún comando coincide con una regla de consulta: retornar `ask` con la razón correspondiente.

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

**Step 7 — ALLOW.** Retornar `allow`.

**Deny beats ask**: Cuando una secuencia de comandos coincide a la vez con una regla de denegación y una de consulta (en comandos separados del array), `deny` MUST ganar.

### 3.5 Error handling

En cualquier error de parseo o evaluación: retornar `ask` explicando que el hook no pudo inspeccionar la llamada. El hook MUST NOT fallar ni salir con código distinto de cero.

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

## 10. Clarifications

### Session 2026-07-01

- Q: Domain→path ownership rule for drift detection — does the drift helper need a new explicit glob mapping added to the manifest, or can it derive source globs from something already recorded there? → A: Derive them from the existing `sources: ...` list already present in each domain's Domain Map bullet in `openspec/specs/_baseline/manifest.md` (confirmed present for all 7 recorded domains: generator, routing, hooks, skills, agents, skill-registry, install). No new manifest field, file, or schema change is introduced. Parsing convention: split the text after the `| sources:` marker on `,`, trim whitespace per entry; each resulting entry is a literal path or glob pattern (`*`/`**`) relative to repo root. This is encoded as a normative bullet and scenario under "Domain Drift Detection Helper" above.
- Q: Is `DISABLE_SPEC_DRIFT_GUARD` the single kill switch for BOTH the session-start drift summary and the pre-commit advisory, or should each be independently toggleable? → A: Confirmed single kill switch for both, as already specified in this delta (SessionStart Spec Drift Summary requirement and PreToolUse Step 1 BYPASS bullet). This mirrors the existing one-variable-covers-both-hook-paths precedent already in the codebase: `DISABLE_GIT_COLLABORATION_GUARD` gates both the SessionStart advisory (`scripts/hooks/session-start.js:167`) and the PreToolUse ask-rule (`scripts/hooks/pre-tool-use.js:392`) under a single variable, and `DISABLE_AGENT_SHIELD` follows the same pattern across both hooks. Both concerns are a single logical guard spanning two hook entry points, not two independent concerns — so no independent per-hook toggle is introduced. No normative text changed as a result (the spec already reflected this); this session records the confirmed rationale.

---

## 11. Scenarios

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
