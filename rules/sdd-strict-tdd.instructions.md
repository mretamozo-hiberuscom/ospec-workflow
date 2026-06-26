---
description: 'Strict TDD forwarding and evidence rules for SDD apply and verify phases.'
applyTo: '**/*.{spec.ts,test.ts,cs,js,go,py,kt}'
---

> Plugin-bundled instruction: Keep this file in sync with the target distribution folders (run the configuration build script to reload/sync changes).

# Strict TDD Protocol

Load these rules only when `openspec/config.yaml` explicitly enables `strict_tdd: true` and Strict TDD Mode is active. The orchestrator should forward: `STRICT TDD MODE IS ACTIVE. Test runner: {command or "unavailable"}.`

## Apply phase

- Follow RED → GREEN → TRIANGULATE → REFACTOR for every assigned task.
- Do not write production code before a failing or newly impossible test exists.
- Execute the relevant test file for GREEN when a verified command-execution tool is available.
- If command execution is unavailable, do not fake execution evidence. Instead, perform rigorous static verification (e.g., checking logic, boundary conditions, and mock implementations), document the task as `STATIC_VALIDATED` or `DEFERRED` in the evidence table, and require actual runtime execution verification during a later environment-capable `sdd-verify` phase.
- Persist a `TDD Cycle Evidence` table in `apply-progress.md`.

Required evidence columns:

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |

## Verify phase

- Read `apply-progress.md` and validate the TDD evidence against real test files and execution output.
- Runtime test execution evidence overrides static inspection when deciding compliance. If tasks were marked `STATIC_VALIDATED` or `DEFERRED`, execute their test files during this verify phase if a test runner is now available to obtain runtime verification.
- A spec scenario is compliant only when a covering test passed at runtime (or statically validated with documented rationale if execution remains impossible across all environments).
- Audit assertion quality: no tautologies, ghost loops, type-only smoke tests, or tests that do not exercise production code.
- If Strict TDD evidence is missing or cannot be proven (without valid `STATIC_VALIDATED`/`DEFERRED` status and rationale), report a CRITICAL issue.

Detailed rules live in `skills/sdd-apply/strict-tdd.md` and `skills/sdd-verify/strict-tdd-verify.md`.
