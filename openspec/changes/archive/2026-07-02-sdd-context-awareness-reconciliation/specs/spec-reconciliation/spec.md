# spec-reconciliation Specification

## Purpose

`spec-reconciliation` closes the drift gap surfaced by the `hooks` domain's session-start and pre-commit advisories. It provides an explicit, user-invoked `/sdd-reconcile [domain]` command (and companion `skills/sdd-reconcile/SKILL.md`) that folds already-shipped, undocumented code changes back into `openspec/specs/{domain}/spec.md` as a retroactive delta, scoped only to the diff window since that domain's last recorded baseline hash — never a full-codebase rewrite. It is opt-in only and never auto-invoked.

## Requirements

### Requirement: Opt-In Invocation Only

`/sdd-reconcile` MUST only be invoked explicitly by the user (slash command or an equivalent natural-language request routed by the orchestrator). No hook, gate, or advisory added by the `hooks` or `agents` domain deltas in this change MAY auto-invoke `/sdd-reconcile`; those paths are limited to recommending it in advisory text.

#### Scenario: Drift advisory suggests, does not invoke

- GIVEN SessionStart reports `specDrift` for the `hooks` domain
- WHEN the advisory text is composed
- THEN it MAY recommend running `/sdd-reconcile hooks`
- AND it MUST NOT invoke `/sdd-reconcile` automatically

#### Scenario: Explicit user invocation required

- GIVEN a domain has recorded drift
- WHEN the user explicitly runs `/sdd-reconcile hooks`
- THEN the orchestrator delegates to the reconcile flow
- AND no other route or gate in the system triggers the same flow without explicit invocation

### Requirement: Diff-Window-Scoped Retroactive Spec Delta

Given a domain with recorded drift, WHEN the user runs `/sdd-reconcile <domain>`, THEN the skill MUST:
1. Read the domain's last recorded manifest commit hash and source globs from `openspec/specs/_baseline/manifest.md`.
2. Compute `git diff --name-only <hash>..HEAD` filtered by that domain's source globs — the diff window — and MUST NOT inspect files outside that window or outside that domain's globs.
3. Derive requirement/scenario text describing only the behavior change observed inside the diff window.

When `<domain>` is omitted, the skill MUST default to processing every domain currently reported as drifted by the drift-detection helper; when none are drifted, it MUST report a no-op and make no writes.

#### Scenario: Domain specified — window scoped to that domain's diff

- GIVEN the `hooks` domain was last recorded at commit `59fbfe8` and has drifted
- WHEN the user runs `/sdd-reconcile hooks`
- THEN the produced delta is derived only from `git diff --name-only 59fbfe8..HEAD` filtered by the `hooks` domain's source globs
- AND no other domain's spec is touched

#### Scenario: Domain omitted — all drifted domains processed

- GIVEN two domains report drifted
- WHEN the user runs `/sdd-reconcile` with no argument
- THEN both domains are processed, each scoped to its own diff window
- AND a domain with no drift is left untouched

#### Scenario: No drifted domains — no-op

- GIVEN the drift-detection helper reports zero drifted domains
- WHEN the user runs `/sdd-reconcile`
- THEN the skill MUST report a no-op and MUST NOT write any file

### Requirement: Read-Then-Update — No Silent Overwrite

`/sdd-reconcile` MUST read the existing `openspec/specs/{domain}/spec.md` before writing. It MUST merge the derived delta additively (new or amended requirement/scenario sections) and MUST NOT discard or silently replace existing requirement content that falls outside the diff window's behavior.

#### Scenario: Existing spec content preserved

- GIVEN `openspec/specs/hooks/spec.md` already documents unrelated requirements not touched by the diff window
- WHEN `/sdd-reconcile hooks` writes its result
- THEN all pre-existing requirement content outside the diff window MUST remain unchanged
- AND only the reconciled behavior is added or amended

#### Scenario: Main spec changed since last read — re-read before merge, no clobber

- GIVEN `openspec/specs/{domain}/spec.md` was modified since the skill last read it
- WHEN `/sdd-reconcile` attempts to persist its result
- THEN it MUST re-read the current file content before merging
- AND MUST NOT blindly overwrite with a stale in-memory copy

### Requirement: Manifest-Append Convention

After reconciling a domain, `/sdd-reconcile` MUST append a new row to the `## Entries` table in `openspec/specs/_baseline/manifest.md` for that domain, recording the new HEAD commit hash reached and a fresh timestamp — mirroring the append-only, latest-row-wins convention already used by `sdd-baseline`. It MUST NOT edit or delete prior rows.

#### Scenario: New hash row appended after reconciling

- GIVEN `hooks` was last recorded at commit `59fbfe8`
- AND `/sdd-reconcile hooks` completes successfully at HEAD commit `abc1234`
- WHEN the manifest is updated
- THEN a new row for `hooks` MUST be appended with commit `abc1234` and a current timestamp
- AND the prior `59fbfe8` row MUST remain in the table unmodified

#### Scenario: Reconcile fails mid-way — no manifest row appended

- GIVEN `/sdd-reconcile` errors while deriving the spec delta before any write occurs
- WHEN the failure is reported
- THEN no new row MUST be appended to the manifest
- AND the domain's drift status MUST remain unchanged for the next session-start check

### Requirement: Unknown Domain Handling

WHEN the user specifies a `<domain>` argument not present in `baseline.domains_done`, `/sdd-reconcile` MUST NOT attempt any git diff or spec write; it MUST report the invalid domain and list the valid domain names.

#### Scenario: Invalid domain name rejected

- GIVEN the user runs `/sdd-reconcile payments` and `payments` is not a recorded baseline domain
- WHEN the skill validates the argument
- THEN it MUST reject the request without any file write
- AND MUST list the valid domain names from `baseline.domains_done`

### Requirement: Command and Skill Registration

`commands/sdd-reconcile.prompt.md` MUST conform to the existing command frontmatter contract (agents domain spec §3.1): `agent: sdd-orchestrator`, plus present `name`/`description` fields, so it routes through the orchestrator rather than directly to a phase agent. `skills/sdd-reconcile/SKILL.md` MUST carry the `delegate_only`/`user-invocable: false` stop-sign frontmatter used by every other SDD phase skill (e.g. `skills/sdd-baseline/SKILL.md`), and `agents/sdd-orchestrator.agent.md`'s frontmatter `agents: [...]` allowlist MUST include `sdd-reconcile` so the orchestrator may dispatch it. Discoverability/registration for SDD phase skills runs through this allowlist-plus-command-routing mechanism, NOT through `discoverSkills`/the skill-registry cache: `shouldIncludeSkill` (`scripts/lib/skill-registry.js`) deliberately excludes every `sdd-*` skill directory from that cache, since the registry indexes utility/stack skills for compact-rule injection into sub-agent prompts, not SDD phase executors.

#### Scenario: Command routes through the orchestrator

- GIVEN the user runs `/sdd-reconcile hooks`
- WHEN the command is dispatched
- THEN it routes to `sdd-orchestrator`, not directly to a phase agent, per the existing command contract

#### Scenario: Orchestrator can dispatch the reconcile executor

- GIVEN `agents/sdd-orchestrator.agent.md`'s frontmatter `agents: [...]` allowlist
- WHEN the orchestrator resolves `/sdd-reconcile` to a sub-agent launch
- THEN `sdd-reconcile` MUST be present in that allowlist, mirroring every other phase agent

#### Scenario: Skill is correctly excluded from the general skill-registry cache

- GIVEN `skills/sdd-reconcile/SKILL.md` exists with `delegate_only: true`/`user-invocable: false` frontmatter, mirroring `skills/sdd-baseline/SKILL.md`
- WHEN SessionStart runs `discoverSkills`
- THEN `sdd-reconcile` MUST NOT appear in the registry cache (`shouldIncludeSkill` excludes all `sdd-*` directories) — this is the same, intended behavior as every other SDD phase skill, not a registration gap
