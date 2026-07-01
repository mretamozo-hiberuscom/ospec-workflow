---
title: Known Issues
last_updated: 2026-07-02
---

## Escenario "skill discoverable via discoverSkills" es insatisfacible: shouldIncludeSkill excluye todos los dirs sdd-*

- severity: WARNING
- area: scripts/lib/skill-registry.js:188 shouldIncludeSkill (filtro !startsWith("sdd-")) vs specs/spec-reconciliation Command and Skill Registration
- workaround: corregir el escenario para referenciar el pipeline de generacion/validacion (scripts/check.js) en vez de discoverSkills, o eliminar la afirmacion; corregir tambien apply-progress/state que declaran falsamente "skill confirmed indexed". La skill sdd-reconcile se registra/valida identica a sdd-baseline y el routing funciona via el allowlist agents del orchestrator, no depende de discoverSkills.
- change: sdd-context-awareness-reconciliation
- date: 2026-07-02

## Escenarios MUST de prosa (Fase 4/5: gate del orchestrator + executor reconcile) solo tienen inspection-proof, sin cobertura de runtime

- severity: WARNING
- area: agents/sdd-orchestrator.agent.md (Ambient SDD Awareness Gate) + agents/sdd-reconcile.agent.md (algoritmo 0-5)
- workaround: agregar tests de doc-assertion ("agent.md documents X") espejando el precedente ya existente para otros agentes de fase, para elevar los 8 escenarios de agents y los 10 de spec-reconciliation de inspection-proof a runtime-test; el design los alcanzo solo a generacion/validacion, decidir en design/spec si se refuerzan.
- change: sdd-context-awareness-reconciliation
- date: 2026-07-02

## Go git-commit risky-trigger del git-collaboration-guard no tiene test de runtime dedicado (asimetria de paridad con Node)

- severity: WARNING
- area: internal/hooks/pretooluse.go:45 isRiskyAction (rama gitCommitPatternRE, cobertura 83.3%)
- workaround: agregar TestPreToolUse_GitGuard_GitCommitDefaultBranch espejando el caso (h) de scripts/hooks/pre-tool-use.test.js para probar git commit en rama por defecto devuelve ask
- change: harness-git-collaboration
- date: 2026-06-28

## readFileSync sin try/catch en cli.js gatherRuntimeScripts propaga EACCES/EPERM sin exit code claro

- severity: WARNING
- area: scripts/configure/cli.js:132
- workaround: envolver el readFileSync del walker BFS en try/catch para degradar errores no-ENOENT con un exit code/mensaje claro
- change: federation-tooling-fidelity
- date: 2026-06-22

## catch vacio en resolveCoordinatorRoot absorbe EACCES/EPERM silenciosamente

- severity: WARNING
- area: scripts/lib/federation-baseline-orchestrator.js:112
- workaround: registrar o reclasificar los errores no-ENOENT en el catch en vez de absorberlos en silencio (codigo preexistente, no tocado por este change)
- change: federation-tooling-fidelity
- date: 2026-06-22

## github-copilot/opencode dist falla su validador: vscode namespace residue en federation-baseline-orchestrator.js

- severity: BLOCKER
- status: RESOLVED
- resolution: Changed the literal `approver` value to target-agnostic `orchestrator/askQuestions` in unified-baseline-gate spec (RWU-1). 4 builds exit 0 with 0 vscode/ residue in dist/github-copilot and dist/opencode.
- area: scripts/configure (cli.js gatherRuntimeScripts) + validate-github-copilot.js / validate-opencode.js
- change: federation-tooling-fidelity
- date: 2026-06-22

## apply-progress declara falsamente que los fallos de validador son preexistentes

- severity: BLOCKER
- status: RESOLVED
- resolution: Full verification suite RE-VERIFY FINAL ran 681/681 (exit 0); all 4 builds exit 0 with 0 errors; 0 vscode/ residue verified in dist. Validators no longer fail. Prior failures were real (not preexisting); they were fixed by RWU-1 (approver normalization).
- area: openspec/changes/federation-tooling-fidelity/apply-progress.md (Test Summary / Issues Found)
- change: federation-tooling-fidelity
- date: 2026-06-22

## La red de seguridad de tasks no obligó a inspeccionar real-repo.test.js para el contenido recién empaquetado

- severity: WARNING
- area: openspec/changes/federation-tooling-fidelity/tasks.md (Phase 2/4 GREEN gates)
- workaround: añadir verificación explicita de los validadores per-target al empaquetar nuevos scripts runtime
- change: federation-tooling-fidelity
- date: 2026-06-22
