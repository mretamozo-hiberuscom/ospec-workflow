# Spec: federated-hooks-parity-guard

## Domain
Hooks launcher capability-based routing for Go/JS parity.

## Scope
Launcher script `scripts/hooks/ospec-hooks-launch.js` and its tests in `scripts/hooks/ospec-hooks-launch.test.js`.

---

## 1. Capability Routing Rules

The hooks launcher prefers the compiled Go binary when available on the host platform. However, the Go binary does not support workspace federation. To maintain parities and avoid divergence of behavior, the launcher must route specific events to their Node.js JS fallbacks when running in a federated workspace.

### 1.1 Config Parsing and Backend Resolution
- The launcher MUST read and parse the `backend` field from `openspec/config.yaml` in a synchronous, dependency-free manner.
- If `openspec/config.yaml` is missing, unreadable, or doesn't specify a backend, it MUST default to the `openspec` (single-repo) backend.

### 1.2 Capability-Aware Resolution
When resolving the hook invocation command:
- If the resolved backend is `workspace-federated` AND the event/subcommand is one of the federation-aware hooks (`session-start`, `pre-compact`, `stop`), the launcher MUST bypass the Go binary and run the corresponding Node.js hook (e.g. `session-start.js`).
- If the resolved backend is `openspec` OR the subcommand is not federation-aware (`pre-tool-use`, `subagent-stop`), the launcher MUST use the Go binary (if available).

### 1.3 Hot Path Performance Protection
- To avoid any disk I/O overhead on the hot path, the launcher MUST NOT read, open, or parse `openspec/config.yaml` if the subcommand is `pre-tool-use` or `subagent-stop`.

---

## 2. Scenarios

### Scenario: Single-repo workspace executes session-start with binary present
Given a workspace configured with `backend: openspec` (or missing configuration)
And the native Go binary `ospec-hooks` exists
When the launcher is run for `session-start`
Then it MUST resolve the invocation to the Go binary.

### Scenario: Federated workspace executes pre-tool-use with binary present
Given a workspace configured with `backend: workspace-federated`
And the native Go binary `ospec-hooks` exists
When the launcher is run for `pre-tool-use`
Then it MUST NOT read `openspec/config.yaml`
And it MUST resolve the invocation to the Go binary.

### Scenario: Federated workspace executes session-start with binary present
Given a workspace configured with `backend: workspace-federated`
And the native Go binary `ospec-hooks` exists
When the launcher is run for `session-start`
Then it MUST bypass the Go binary
And it MUST resolve the invocation to the Node fallback `session-start.js`.

### Scenario: Federated workspace executes pre-compact with binary present
Given a workspace configured with `backend: workspace-federated`
And the native Go binary `ospec-hooks` exists
When the launcher is run for `pre-compact`
Then it MUST bypass the Go binary
And it MUST resolve the invocation to the Node fallback `pre-compact.js`.

### Scenario: Federated workspace executes stop with binary present
Given a workspace configured with `backend: workspace-federated`
And the native Go binary `ospec-hooks` exists
When the launcher is run for `stop`
Then it MUST bypass the Go binary
And it MUST resolve the invocation to the Node fallback `stop.js`.
