# Exploration: federation-c1-hardening (C6)

**Date**: 2026-06-19
**Change**: federation-c1-hardening (C6 del programa de federación)

## Context

C1 (`federation-distributed-markers`) fue archivado con verdict PASS WITH WARNINGS. Este change aborda los findings no-bloqueantes heredados: W1-W4, S1-S6 y readability.

## Findings Assessment

### IN SCOPE (confirmed actionable)

| Id | Type | Status | Action Required |
|----|------|--------|-----------------|
| W1 | spec-gap | **Open** | Alinear terminología de `workspace-explore` spec con `federation-markers` spec (autoritativo) |
| W2 | design-gap | **Open** | Corregir `isCorruptCache` en `artifact-store.js` — distinguir "workspace vacío legítimo" de "cache corrupto" |
| W3 | code-bug/flake | **Open** | Agregar DI seam para `spawnSync("git")` en `warnIfGitTracked` y mockear en tests |
| S1 | suggestion | **Partially done** | Warning suppression por origin ya existe. Falta: escribir `roster: []` explícito en explore markers |
| S4-S6 | suggestion | **Open** | Renaming + comments + docstrings en lib modules de federación |

### OUT OF SCOPE

| Id | Type | Reason |
|----|------|--------|
| W4 | design-gap (inherent) | Agent procedures son probados solo por static-proof — limitación inherente del enfoque. Se documenta como accepted. |
| S2 | suggestion | Traceability issue en el design doc original (C1 archivado). Corregirlo en un archivo archivado no aporta valor. |
| S3 | suggestion | **Ya resuelto en C2** — `federation-explore.js` usa `writeFileAtomic` desde atomic-write.js |

## Code Analysis

### W2: `isCorruptCache` (artifact-store.js:140-146)

```javascript
function isCorruptCache(content, parsed) {
  return (
    Boolean(content.trim()) &&
    parsed.members.length === 0 &&
    parsed.contracts.length === 0
  );
}
```

**Problem**: Un `workspace.yaml` que contenga la estructura válida pero sin members (ej. `members:\ncontracts:\n`) parseará con arrays vacíos, lo cual es byte-wise no-vacío → triggerea regeneración.

**Fix**: Considerar corrupto SOLO cuando el contenido no parsea correctamente (i.e. las líneas `members:` / `contracts:` no existen). Un workspace con headers válidos pero sin entradas es legítimo.

### W3: `warnIfGitTracked` (artifact-store.js:163-179)

```javascript
function warnIfGitTracked() {
  try {
    const result = spawnSync("git", ["ls-files", "openspec/workspace.yaml"], {
      cwd: workspace,
      encoding: "utf8",
    });
    // ...
```

**Problem**: `spawnSync` directo sin DI seam. El test (artifact-store.test.js:368-400) llama `git init`, `git add` reales.

**Fix**: Inyectar `spawnSync` como parámetro del factory (`createWorkspaceFederatedStore`) con fallback al real. Los tests pasan un mock.

### S1: Explore markers sin `roster`/`remote`

`federation-explore.js:198` produce:
```javascript
return { federation: { id: containerId }, member, origin: "explore" };
```
No incluye `roster` ni `member.remote`. El merge (`workspace-atlas.js:709`) ya suprime el warning de roster para `origin: "explore"`, y `loadMarkerFromMember` (408) suprime el warning de remote.

**Fix**: Hacer que explore escriba `roster: []` explícitamente en el marker data para que la intención sea explícita.

## Decisions (from user Q&A)

1. **W1**: `federation-markers` es spec autoritativo → `workspace-explore` adopta su vocabulario
2. **W2**: Check explícito sin campo extra — 0 members + workspace.yaml válido ≠ corrupción
3. **W3**: DI seam para `spawnSync` como dependencia inyectable
4. **S1**: Ambas: markers lean de explore + supresión inteligente por origin
5. **S3**: Verificado → excluido (ya resuelto en C2)
6. **S4-S6**: Resolver todos: renaming + comments + docstrings
