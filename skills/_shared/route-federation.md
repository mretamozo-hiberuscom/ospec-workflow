### Workspace Federation (optional, multi-repo)

This applies only when `openspec/config.yaml` has `artifact_store.backend: workspace-federated`.
For single-repo work (the default `openspec` backend) skip this section entirely.

**Federated Foundation delegation.** When the `workspace-federated` backend is active and the foundation phase is triggered, the orchestrator delegates to `sdd-foundation` in federated mode, passing `workspace_yaml` pointing to `workspace.yaml` and `parent_change` containing the active change name.

**Aggregated recovery.** When the backend is federated, the active-change view spans all
member repos declared in `openspec/workspace.yaml`. Recover from the **aggregated**
active changes (each tagged with a `source` member id), not just the coordinator's. The
SessionStart/PreCompact/Stop hooks already aggregate; treat their summaries as spanning
members. Never assume a single active change.

**Impact Advisory (before a cross-repo change).** Before launching `/sdd-new` (or an
equivalent request) for work that touches more than one member, delegate to
`sdd-workspace impact <change>` to compute the affected members from the contract graph,
then surface them with `vscode/askQuestions` so the user can scope reviewer load and
delivery (chained PRs per member are usually right). Do not auto-plan a cross-repo
change without this.

**Boundaries.** v1 federation is **read-and-link**: the orchestrator reads and reconciles
member state but MUST NOT write SDD artifacts into member repos through the federated
store. Each member runs its own standard change folder; the coordinator holds the
cross-cutting proposal/design and a `federation.yaml` linking member slices. Use
`sdd-workspace` (`init`/`status`/`impact`) as the front door; add it to the `agents` list
when operating a federated workspace.

**Markers as truth (C1 inversion).** The canonical federation source of truth is the
per-member marker `openspec/federation.member.yaml`, not the coordinator atlas.
`openspec/workspace.yaml` is a **derived, gitignored, regenerable cache** of those markers:
trusted when valid, regenerated when absent or corrupt. The ONLY sanctioned member-repo
write is `enroll` (the marker), performed exclusively through `sdd-workspace`.

**Explore is the federation front door.** `sdd-workspace explore` realizes the
workspace-explore phase: depth-1 container discovery, per-member classification
(type/layer/brownfield/init-done), idempotent `enroll`, then regeneration of the atlas
cache and `openspec/workspace-map.md`. A per-member enroll failure is recorded as
`pending` and never aborts the run. Route a fresh multi-repo container through
`sdd-workspace explore` before any cross-repo planning.

> **Future interface (informational, NOT designed in C1).** A D11 dedicated *coordinator
> repo* — a standalone repo that owns the cross-cutting atlas/roster and orchestrates
> member changes — is a planned follow-on interface. C1 ships only the marker mechanism
> and the explore phase; do not assume a coordinator repo exists yet.


### Federation Baseline Loop

When orchestrating baseline federation, the agent executes the loop using the `federation-baseline-orchestrator` library (which acts as the decision core, while the agent serves as the effect layer):

1. **Candidate Selection**: Derive the candidates using `selectCandidates` with a probe of `brownfield && !initDone` verified directly on the filesystem (never from the cached marker).
2. **Unified Gate**: Scan the fresh domain-maps of all candidates. If `unified_gate.status` is not `'approved'`, present a single unified gate to the user via `vscode/askQuestions`. Once approved, record the approval atomically in `federation-baseline-status.yaml`.
3. **Sequential Iteration**: Iterate candidates in deterministic order (atlas order, tie-broken by `member.id` ascending):
   - If `done` -> skip.
   - If `partial` -> re-delegate only if there is forward progress.
   - If `pending` and gate approved -> delegate.
   - If `failed` -> skip, unless `--retry-failed` is provided.
4. **Delegation**: Delegate to `sdd-baseline` with the four federated parameters: `federation_member_id`, `target_dir`, `parent_change`, and `coordinator_root`.
5. **Failure Policy**: Implement the `continue-log-retry` policy. A terminal failure of a member changes its status to `failed`, logs a warning with the error message verbatim, and allows the loop to continue with other members. The `unified_gate` is NOT invalidated.
6. **Retry Mechanism**: The `--retry-failed` flag re-includes failed members in the iteration, but does NOT re-present the approved unified gate. Perform standard idempotency checks.
7. **Read-and-Link Boundary (D10)**: The coordinator only reads markers/configurations as probes; it NEVER writes any files under `{member}/openspec/specs/`.

