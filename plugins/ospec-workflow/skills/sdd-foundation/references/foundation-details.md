# SDD Foundation Details

## Purpose

`sdd-foundation` creates the missing project baseline that normal SDD needs before implementation: product intent, functional scope, architecture intent, tooling expectations, and an initial roadmap.

It does not replace `sdd-init`. Init detects reality. Foundation captures agreed intent for a repo that does not yet have enough reality to detect.

## Question Order

Ask only the first missing blocking question.

1. Product goal: what are we building and for whom?
2. Primary users: who uses it, and what outcome do they need?
3. First capabilities: what must exist in the first usable slice?
4. Constraints: deadlines, compliance, integrations, deployment, data sensitivity.
5. Stack: required language/framework/package manager, or explicit freedom to choose.
6. Architecture preference: monolith, modular monolith, hexagonal, frontend/backend split, serverless, etc.
7. Testing bar: unit/integration/e2e expectations and strict TDD preference.
8. Delivery target: local only, container, cloud provider, CI/CD, environments.
9. Roadmap: first milestone and what is intentionally deferred.

## Documentation Layout

```text
docs/
  product/
    brief.md
    functional-scope.md
    glossary.md
  architecture/
    technical-baseline.md
    decisions/
      README.md
  roadmap.md
  references/
    raw/
      README.md
    processed/
      README.md
```

## LLM-First Document Rules

- Lead with the decision or current truth.
- Keep each doc short enough to scan.
- Use tables for decisions, constraints, and open questions.
- Preserve raw source text in `docs/references/raw/` when the user supplies files.
- Processed references must include: source file, useful facts, noise removed, assumptions, open questions.
- Do not bury unknowns. Use `Unknown` or `TBD`, then list the next question.

## Config Update Guidance

Update `openspec/config.yaml` conservatively:

```yaml
project:
  status: foundation-defined
  stack:
    languages: [...]
    frameworks: [...]
    package_managers: [...]
    architecture: "..."
  commands:
    install: [...]
    build: [...]
    test: [...]
    lint: [...]
    format: [...]
    typecheck: [...]

foundation:
  product_brief: docs/product/brief.md
  functional_scope: docs/product/functional-scope.md
  technical_baseline: docs/architecture/technical-baseline.md
  roadmap: docs/roadmap.md
  open_questions: [...]

rules:
  foundation:
    - Ask one blocking question at a time.
    - Do not generate application code before scaffold/project setup is approved.
```

If a command is expected but not executable yet, record it as intent and keep verification status unavailable until the scaffold exists.
