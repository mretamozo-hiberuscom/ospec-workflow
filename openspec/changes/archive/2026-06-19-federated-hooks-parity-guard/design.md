# Design: federated-hooks-parity-guard

## Overview
Implement capability-aware capability routing in the hooks launcher `ospec-hooks-launch.js` to run Node.js fallback hooks instead of the compiled Go binary when the workspace is configured as `workspace-federated` (for the hooks that depend on federation). Ensure no overhead in the hot-path hook (`pre-tool-use`).

---

## Architecture Decisions

### AD-1: Synchronous YAML parsing heuristic in the launcher

**Decision**: Implement a synchronous, lightweight, dependency-free text/regex-based YAML parser (`readBackendModeSync`) inside `ospec-hooks-launch.js` instead of importing heavy modules or using async fs.

**Rationale**: The launcher `ospec-hooks-launch.js` runs synchronously via `spawnSync` from Claude Code, and must be fast. Reading the configuration file synchronously via `fs.readFileSync` and parsing it via regex matches the approach taken in `ospec-state.js` but keeps the launcher isolated and fast.

### AD-2: Hot Path Performance Protection

**Decision**: Skip reading `openspec/config.yaml` entirely if the subcommand is `pre-tool-use` or `subagent-stop`.

**Rationale**: `pre-tool-use` is called before every single tool execution (hot path). Any filesystem reads on this path add cold-start overhead. Since `pre-tool-use` and `subagent-stop` are not affected by workspace aggregation (they don't read members' active changes or write the workspace block to cache), they can safely run the Go binary without config checks.

---

## File Changes

### `scripts/hooks/ospec-hooks-launch.js`

| Section/Function | Change |
|------------------|--------|
| Helper functions | Add `readBackendModeSync(configPath)` to check the backend mode from `openspec/config.yaml`. |
| `resolveInvocation(sub, scriptDir, suffix, exists, readFileSync)` | Update signature to support dependency injection for filesystem checks and reads (enabling unit testing). |
| `resolveInvocation` logic | For `session-start`, `pre-compact`, and `stop`, read `config.yaml` (if it exists). If the backend is `workspace-federated`, bypass the Go binary and return the Node.js script invocation. |

#### Implementation Draft: `readBackendModeSync`
```javascript
function readBackendModeSync(configPath, readFileSync = fs.readFileSync) {
  try {
    const content = readFileSync(configPath, "utf8");
    let inArtifactStore = false;
    for (const raw of content.split(/\r?\n/)) {
      const trimmed = raw.trim();
      const indent = raw.match(/^\s*/)[0].length;
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      if (indent === 0) {
        inArtifactStore = trimmed === "artifact_store:";
        continue;
      }
      if (inArtifactStore) {
        const match = trimmed.match(/^backend:\s*(.+)$/);
        if (match) {
          return match[1].replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\s+#.*$/, "").trim();
        }
      }
    }
  } catch (err) {
    // Ignore and fall back
  }
  return "openspec";
}
```

---

### `scripts/hooks/ospec-hooks-launch.test.js`

| Test Case | Verification |
|-----------|--------------|
| "resolveInvocation bypasses binary and returns node fallback for session-start when backend is workspace-federated" | Asserts Node fallback script is resolved when config backend is federated. |
| "resolveInvocation uses binary for session-start when backend is openspec" | Asserts Go binary is resolved when backend is `openspec` and binary exists. |
| "resolveInvocation uses binary for pre-tool-use in federated backend" | Asserts Go binary is resolved for `pre-tool-use` even in a federated backend (proving zero config-read hot-path check). |

---

## Test Strategy
- **Unit tests**: Test the new routing logic in `ospec-hooks-launch.test.js` by injecting mocks for `exists` and `readFileSync`.
- **Run command**: `npm test`
