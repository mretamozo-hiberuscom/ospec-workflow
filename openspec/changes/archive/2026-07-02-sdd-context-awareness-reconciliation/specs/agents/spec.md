# Delta for agents

## ADDED Requirements

### Requirement: Ambient SDD Awareness Active-Question Gate

Independent of whether the user's request mentions "SDD" or invokes any `/sdd-*` command, the orchestrator MUST evaluate — before performing any inline or delegated work on a user task — whether the task's target files overlap (a) an active OpenSpec change's declared file scope, or (b) a specced baseline domain's source globs (per `baseline.domains_done` and the manifest Domain Map, surfaced via session-start context including the `specDrift` and `capabilities` fields).

When such an overlap exists AND the task is non-trivial, the orchestrator MUST call `AskUserQuestion`, offering to route the task through the SDD workflow, BEFORE proceeding with any part of the task.

A task MUST be classified as non-trivial when EITHER of the following holds:
- (a) the task touches **2 or more files**, OR
- (b) the task introduces **new logic or architecture** — a new function, a new module, or a change in behavior — regardless of how many files it touches.

A task MUST NOT be classified as non-trivial, and the gate MUST NOT fire, when it is a **single-file cosmetic change**: a typo fix, a comment-only edit, a rename, a formatting-only change, or a one-line fix that does not change behavior.

Because condition (a) and condition (b) are joined by OR, a task satisfying either one independently is sufficient to classify it as non-trivial — the two conditions are not both required, and neither condition overrides the other's ability to trigger the gate on its own.

This rule resides in the orchestrator's CORE zone (see §15, Orchestrator Body Partitioning), alongside the SDD Init Guard — it is an always-on check, not a circumstantial handler gated by route or config, and MUST NOT be relocated to a `skills/_shared/` on-demand handler.

If the user declines to route through SDD, the orchestrator MUST proceed with the task directly and MUST NOT create any OpenSpec artifacts as a side effect of having asked.

#### Scenario: Non-trivial task overlapping an active change's scope — gate fires without "SDD" being mentioned

- GIVEN an active OpenSpec change declares `scripts/hooks/pre-tool-use.js` in its scope
- AND the user asks "fix the bug in pre-tool-use.js" with no mention of SDD or any `/sdd-*` command
- AND the task touches 2 or more files (condition a)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `AskUserQuestion` offering to route the task through the SDD workflow BEFORE performing any inline or delegated work

#### Scenario: Non-trivial task overlapping a specced baseline domain — gate fires

- GIVEN no active change exists
- AND the task's target files match the `agents` baseline domain's source globs
- AND the task touches 2 or more files (condition a)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `AskUserQuestion` before proceeding

#### Scenario: Single-file change introducing new logic or a behavior change — gate fires (file count alone is not the trigger)

- GIVEN the task's target file overlaps an active change's declared scope or a specced baseline domain
- AND the task touches only 1 file
- AND the task introduces a new function, a new module, or a change in behavior (condition b)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `AskUserQuestion` before proceeding
- AND this MUST hold even though condition (a) — the ≥2-files threshold — is not met, because (a) and (b) are independent OR-joined triggers

#### Scenario: Single-file cosmetic change — gate does not fire even when it overlaps an active change's scope

- GIVEN the task's target file overlaps an active change's declared scope or a specced baseline domain
- AND the task touches only 1 file
- AND the task is a typo fix, a comment-only edit, a rename, a formatting-only change, or a one-line fix that does not change behavior
- WHEN the orchestrator evaluates the request
- THEN it MUST NOT call `AskUserQuestion` for this rule and proceeds directly, regardless of the overlap

#### Scenario: Trivial task — gate does not fire

- GIVEN the task's target files overlap a specced domain or an active change's scope
- AND the task touches only 1 file
- AND the task is a single-file cosmetic change (neither condition a nor condition b is met)
- WHEN the orchestrator evaluates the request
- THEN it MUST NOT call `AskUserQuestion` for this rule and proceeds directly

#### Scenario: Multi-file cosmetic-only change — gate fires under the accepted OR condition (accepted trade-off, see Clarifications)

- GIVEN the task's target files overlap an active change's declared scope or a specced baseline domain
- AND the task is a repo-wide rename touching 5 files, with no behavior change in any of them (purely cosmetic across all 5 files)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `AskUserQuestion` before proceeding, because condition (a) — touching ≥2 files — is satisfied on its own regardless of the cosmetic nature of the change
- AND this is an accepted trade-off, not an oversight: see `## Clarifications` below

#### Scenario: No overlap at all — gate does not fire

- GIVEN the task's target files match neither an active change's declared scope nor any specced baseline domain's source globs
- WHEN the orchestrator evaluates the request, regardless of triviality
- THEN it MUST NOT call `AskUserQuestion` for this rule

#### Scenario: User declines — task proceeds without SDD artifacts

- GIVEN the gate fired and the user selects "proceed directly, no SDD"
- WHEN the orchestrator receives the answer
- THEN it MUST proceed with the task directly
- AND MUST NOT create any `openspec/` artifacts as a side effect of having asked

## Clarifications

### Session 2026-07-01

- Q: What concrete heuristic should the orchestrator use to decide a task is "non-trivial" and must trigger the ambient-awareness `AskUserQuestion` gate? → A: Hybrid — the task is non-trivial when EITHER (a) it touches ≥2 files, OR (b) it introduces new logic/architecture (new function, new module, or a behavior change) regardless of file count. The gate MUST NOT fire for single-file cosmetic changes: typo fixes, comment-only edits, renames, formatting-only changes, or one-line fixes that don't change behavior. Encoded as the normative threshold in the "Ambient SDD Awareness Active-Question Gate" requirement above, replacing the prior `per the threshold defined in design.md` placeholder.
- Q: A 5-file, purely cosmetic, repo-wide rename (no behavior change in any file) satisfies condition (a) — ≥2 files — on its own. Should this fire the gate, or should an all-cosmetic multi-file change be exempted even though condition (a) is met? → A: **Accepted trade-off, decided explicitly rather than resolved silently**: it MUST fire, per a strict reading of the accepted OR wording — condition (a) and condition (b) are independent triggers, and satisfying either one alone is sufficient regardless of the other. A multi-file cosmetic-only rename is treated as non-trivial and will surface the `AskUserQuestion` gate, at the cost of occasional friction on repo-wide renames/formatting sweeps. This was a deliberate choice (favoring recall over precision for the ≥2-files signal) and is not an oversight; if this proves too noisy in practice, a future carve-out (e.g. excluding renames detected via a pure git-rename similarity check) can be proposed as a follow-up change rather than reinterpreting the OR condition retroactively.
