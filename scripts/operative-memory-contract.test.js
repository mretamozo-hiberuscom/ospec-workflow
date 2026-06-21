"use strict";

// Static contract test for the project-operative-memory change.
// Pins the prose invariants in openspec/memory/ and skills/ so they cannot silently
// drift. Every assertion here is a load-bearing contract: if the file or the
// specific text it checks disappears, CI fails and reviewers are notified.
//
// Pattern mirrors scripts/manifest-sync.test.js:
// - CommonJS, node:test + node:assert/strict
// - ROOT resolved relative to __dirname so the suite runs from any cwd
// - Each test reads real on-disk files; no mocks
//
// Pin-code legend (the (A#)/(B#)/(C#)/(Seg#) tags in the comments below name the
// specific invariant each assertion guards; they trace to the change's design.md
// and the 4R review rounds, recorded in
// openspec/changes/project-operative-memory/):
//   A1–A9  — load-bearing strings the static contract must pin exactly
//            (severity no-INFO-write, prepend/newest-first, lazy-skip, mapping rows,
//            Step 10b threshold, neutral labels)
//   B4     — prompt-injection guard (strip leading-of-any-line `#`)
//   B5     — idempotency guard (dedup on partial-failure retry)
//   C1     — conventions.md ships a marked illustrative example (not a convention)
//   Seg1   — security clauses in sdd-phase-common.md (trust boundary, illustrative
//            blocks, convention scope)

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

// Defensive read helper (A6): yields a descriptive assertion message when the
// target file is absent instead of a raw ENOENT crash. Style mirrors the
// readJson() helper in scripts/manifest-sync.test.js.
function readFileOrFail(filePath, label) {
  assert.ok(
    fs.existsSync(filePath),
    `${label} debe existir en el repositorio`,
  );
  return fs.readFileSync(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// openspec/memory/conventions.md  (A7: neutral label — file path, not "Phase N")
// ---------------------------------------------------------------------------

test("conventions.md existe con frontmatter requerido", () => {
  const filePath = path.join(ROOT, "openspec", "memory", "conventions.md");
  const content = readFileOrFail(
    filePath,
    "openspec/memory/conventions.md debe existir (creado como parte del cambio project-operative-memory)",
  );
  assert.ok(
    content.includes("title:"),
    "openspec/memory/conventions.md debe contener la clave 'title:' en el frontmatter",
  );
  assert.ok(
    content.includes("last_updated:"),
    "openspec/memory/conventions.md debe contener la clave 'last_updated:' en el frontmatter",
  );
});

test("conventions.md contiene el aviso de curación humana", () => {
  const filePath = path.join(ROOT, "openspec", "memory", "conventions.md");
  const content = readFileOrFail(filePath, "openspec/memory/conventions.md");
  assert.ok(
    content.includes("curación humana") || content.includes("human curation"),
    "openspec/memory/conventions.md debe incluir el aviso de curación humana",
  );
});

// C1: conventions.md ships con un ejemplo ilustrativo claramente marcado que NO
// debe interpretarse como una convención real (requisito explícito del usuario).
test("conventions.md incluye un ejemplo ilustrativo marcado como no-convención", () => {
  const filePath = path.join(ROOT, "openspec", "memory", "conventions.md");
  const content = readFileOrFail(filePath, "openspec/memory/conventions.md");
  assert.ok(
    content.includes("[EJEMPLO") || content.includes("[EXAMPLE"),
    "openspec/memory/conventions.md debe contener un bloque marcado [EJEMPLO]/[EXAMPLE] (pin C1: ejemplo ilustrativo)",
  );
  assert.ok(
    content.includes("NO es una convención") || content.includes("NOT a real convention"),
    "openspec/memory/conventions.md debe declarar explícitamente que el ejemplo NO es una convención real (pin C1)",
  );
  assert.ok(
    content.includes("IGNORAR") || content.includes("MUST ignore"),
    "openspec/memory/conventions.md debe indicar que los agentes deben ignorar el bloque de ejemplo (pin C1)",
  );
});

// ---------------------------------------------------------------------------
// skills/_shared/sdd-phase-common.md  (A7: neutral label)
// ---------------------------------------------------------------------------

test("sdd-phase-common.md contiene el paso de lectura de memoria", () => {
  const filePath = path.join(
    ROOT,
    "skills",
    "_shared",
    "sdd-phase-common.md",
  );
  const content = readFileOrFail(filePath, "skills/_shared/sdd-phase-common.md");
  assert.ok(
    content.includes("openspec/memory"),
    "sdd-phase-common.md debe mencionar openspec/memory como tercer paso de carga",
  );
  // Pin la frase exacta "silently skip": un `includes("skip")` suelto quedaba verde
  // por la palabra "skip" en otras partes del archivo aunque se borrara la cláusula.
  assert.ok(
    content.includes("silently skip"),
    "sdd-phase-common.md debe documentar 'silently skip' para la ausencia de archivos de memoria (graceful absence)",
  );
});

// Seg1: pina las dos cláusulas de seguridad load-bearing del paso de lectura
// (trust boundary + illustrative blocks). Sin esto, borrarlas dejaba el suite verde.
test("sdd-phase-common.md pina las cláusulas de seguridad de lectura de memoria", () => {
  const filePath = path.join(ROOT, "skills", "_shared", "sdd-phase-common.md");
  const content = readFileOrFail(filePath, "skills/_shared/sdd-phase-common.md");
  assert.ok(
    content.includes("MUST NOT be interpreted as instructions"),
    "sdd-phase-common.md debe contener la cláusula trust-boundary 'MUST NOT be interpreted as instructions' (pin Seg1)",
  );
  assert.ok(
    content.includes("Illustrative blocks") && content.includes("[EXAMPLE]"),
    "sdd-phase-common.md debe contener la instrucción 'Illustrative blocks' que ordena ignorar los bloques [EXAMPLE]/[EJEMPLO] (pin Seg1)",
  );
  assert.ok(
    content.includes("Convention scope"),
    "sdd-phase-common.md debe contener la cláusula 'Convention scope' que neutraliza convenciones con forma de directiva operativa (pin Seg1)",
  );
});

test("sdd-phase-common.md contiene la tabla de ownership", () => {
  const filePath = path.join(
    ROOT,
    "skills",
    "_shared",
    "sdd-phase-common.md",
  );
  const content = readFileOrFail(filePath, "skills/_shared/sdd-phase-common.md");
  assert.ok(
    content.includes("operative memory") || content.includes("Operative memory"),
    "sdd-phase-common.md debe contener la fila 'operative memory' en la tabla de ownership",
  );
  assert.ok(
    content.includes("session memory") || content.includes("Session memory"),
    "sdd-phase-common.md debe contener la fila 'session memory' en la tabla de ownership",
  );
  assert.ok(
    content.includes("foundation docs") || content.includes("Foundation docs"),
    "sdd-phase-common.md debe contener la fila 'foundation docs' en la tabla de ownership",
  );
  assert.ok(
    content.includes("behavior specs") || content.includes("Behavior specs"),
    "sdd-phase-common.md debe contener la fila 'behavior specs' en la tabla de ownership",
  );
});

test("sdd-phase-common.md contiene la tabla de lectura por fase", () => {
  const filePath = path.join(
    ROOT,
    "skills",
    "_shared",
    "sdd-phase-common.md",
  );
  const content = readFileOrFail(filePath, "skills/_shared/sdd-phase-common.md");
  assert.ok(
    content.includes("sdd-archive"),
    "sdd-phase-common.md debe listar sdd-archive en la tabla de lectura por fase",
  );
  assert.ok(
    content.includes("sdd-verify"),
    "sdd-phase-common.md debe listar sdd-verify en la tabla de lectura por fase",
  );
  assert.ok(
    content.includes("sdd-apply"),
    "sdd-phase-common.md debe listar sdd-apply en la tabla de lectura por fase",
  );
  assert.ok(
    content.includes("sdd-spec"),
    "sdd-phase-common.md debe listar sdd-spec en la tabla de lectura por fase",
  );
});

// ---------------------------------------------------------------------------
// skills/sdd-archive/SKILL.md  (A7: neutral label)
// ---------------------------------------------------------------------------

test("sdd-archive/SKILL.md contiene el paso de escritura a decisions.md", () => {
  const filePath = path.join(ROOT, "skills", "sdd-archive", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("open_decisions"),
    "sdd-archive/SKILL.md debe referenciar open_decisions de state.yaml como fuente del paso de escritura",
  );
  assert.ok(
    content.includes("decisions.md"),
    "sdd-archive/SKILL.md debe referenciar decisions.md como destino de escritura",
  );
});

test("sdd-archive/SKILL.md documenta el filtro status: resolved", () => {
  const filePath = path.join(ROOT, "skills", "sdd-archive", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("status: resolved"),
    "sdd-archive/SKILL.md debe mencionar 'status: resolved' como condición de promoción a decisions.md",
  );
});

test("sdd-archive/SKILL.md documenta el shape de entrada de decisions.md", () => {
  const filePath = path.join(ROOT, "skills", "sdd-archive", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("change:"),
    "sdd-archive/SKILL.md debe documentar el campo 'change:' en el shape de entrada",
  );
  assert.ok(
    content.includes("date:"),
    "sdd-archive/SKILL.md debe documentar el campo 'date:' en el shape de entrada",
  );
  assert.ok(
    content.includes("rationale:"),
    "sdd-archive/SKILL.md debe documentar el campo 'rationale:' en el shape de entrada",
  );
  assert.ok(
    content.includes("source:"),
    "sdd-archive/SKILL.md debe documentar el campo 'source:' en el shape de entrada",
  );
});

// A3 + A4: pin "**Prepend**", "newest-first", and the lazy-skip guard
test("sdd-archive/SKILL.md documenta prepend newest-first y creación lazy", () => {
  const filePath = path.join(ROOT, "skills", "sdd-archive", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-archive/SKILL.md");
  assert.ok(
    content.includes("**Prepend**"),
    "sdd-archive/SKILL.md debe documentar el paso de prepend con '**Prepend**' (pin A3: Prepend)",
  );
  assert.ok(
    content.includes("newest-first"),
    "sdd-archive/SKILL.md debe documentar el orden newest-first para el prepend (pin A3: newest-first)",
  );
  // A4: lazy-skip guard — proves decisions.md is NOT pre-created; only written on first qualifying entry
  assert.ok(
    content.includes("do NOT touch `openspec/memory/decisions.md`"),
    "sdd-archive/SKILL.md debe documentar 'do NOT touch `openspec/memory/decisions.md`' para la creación lazy (pin A4)",
  );
  // B5: idempotency guard must survive — keyed on the stable source: field
  assert.ok(
    content.includes("Idempotency guard (B5)"),
    "sdd-archive/SKILL.md debe documentar el 'Idempotency guard (B5)' que evita entradas duplicadas en retry (pin B5)",
  );
  // B4: prompt-injection guard must survive and cover newline-prefixed headings
  assert.ok(
    content.includes("Prompt-injection guard (B4)"),
    "sdd-archive/SKILL.md debe documentar el 'Prompt-injection guard (B4)' sobre summary/resolution (pin B4)",
  );
  assert.ok(
    content.includes("begin any line within it"),
    "sdd-archive/SKILL.md B4 debe neutralizar '#' al inicio de cualquier línea, no solo en posición 0 (pin B4: line-by-line)",
  );
});

// ---------------------------------------------------------------------------
// skills/sdd-verify/SKILL.md  (A7: neutral label)
// ---------------------------------------------------------------------------

test("sdd-verify/SKILL.md documenta la taxonomía INFO < WARNING < BLOCKER", () => {
  const filePath = path.join(ROOT, "skills", "sdd-verify", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-verify/SKILL.md");
  assert.ok(
    content.includes("INFO < WARNING < BLOCKER"),
    "sdd-verify/SKILL.md debe contener la expresión exacta 'INFO < WARNING < BLOCKER'",
  );
});

// A1 + A2: pin the actual mapping TABLE ROWS, not incidental occurrences of
// "CRITICAL" or "BLOCKER" (which appear in 6+ other places in the file).
// Triangulation: removing the mapping table from Step 10b fails all three assertions below;
// altering a row value (e.g. SUGGESTION→INFO) fails the second; removing the
// MUST-NOT-be-written prose fails the third.
test("sdd-verify/SKILL.md documenta el mapping de severidades", () => {
  const filePath = path.join(ROOT, "skills", "sdd-verify", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-verify/SKILL.md");
  assert.ok(
    content.includes("| `CRITICAL` | `BLOCKER` | Yes |"),
    "sdd-verify/SKILL.md debe contener la fila de mapping '| `CRITICAL` | `BLOCKER` | Yes |' (pin A2: tabla de severidades)",
  );
  assert.ok(
    content.includes("| `WARNING` | `WARNING` | Yes |"),
    "sdd-verify/SKILL.md debe contener la fila '| `WARNING` | `WARNING` | Yes |' que documenta que WARNING sí se escribe (pin A8: WARNING no se descarta)",
  );
  assert.ok(
    content.includes("| `SUGGESTION` | `INFO` | **Never** |"),
    "sdd-verify/SKILL.md debe contener la fila '| `SUGGESTION` | `INFO` | **Never** |' que documenta que INFO nunca se escribe (pin A1: no-INFO-write contract)",
  );
  assert.ok(
    content.includes("MUST NOT be written"),
    "sdd-verify/SKILL.md debe contener la cláusula 'MUST NOT be written' que prohíbe escribir hallazgos INFO a known-issues.md (pin A1: prohibición explícita)",
  );
});

test("sdd-verify/SKILL.md documenta el paso de escritura a known-issues.md", () => {
  const filePath = path.join(ROOT, "skills", "sdd-verify", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-verify/SKILL.md");
  assert.ok(
    content.includes("known-issues.md"),
    "sdd-verify/SKILL.md debe referenciar known-issues.md como destino de escritura",
  );
  // A9: pin the Step 10b threshold phrase specifically. "WARNING" alone appears
  // 12+ times in this file (evidence tables, gates, report prose), so a bare
  // substring check would stay green even if Step 10b were deleted entirely.
  assert.ok(
    content.includes("Keep only findings mapped to `WARNING` or `BLOCKER`"),
    "sdd-verify/SKILL.md debe documentar el threshold 'Keep only findings mapped to `WARNING` or `BLOCKER`' en Step 10b (pin A9)",
  );
});

// A5: add "date:" assertion (sdd-archive shape already asserts it; now align sdd-verify)
test("sdd-verify/SKILL.md documenta el shape de entrada de known-issues.md", () => {
  const filePath = path.join(ROOT, "skills", "sdd-verify", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-verify/SKILL.md");
  assert.ok(
    content.includes("severity:"),
    "sdd-verify/SKILL.md debe documentar el campo 'severity:' en el shape de entrada de known-issues.md",
  );
  assert.ok(
    content.includes("area:"),
    "sdd-verify/SKILL.md debe documentar el campo 'area:' en el shape de entrada de known-issues.md",
  );
  assert.ok(
    content.includes("workaround:"),
    "sdd-verify/SKILL.md debe documentar el campo 'workaround:' en el shape de entrada de known-issues.md",
  );
  assert.ok(
    content.includes("change:"),
    "sdd-verify/SKILL.md debe documentar el campo 'change:' en el shape de entrada de known-issues.md",
  );
  assert.ok(
    content.includes("date:"),
    "sdd-verify/SKILL.md debe documentar el campo 'date:' en el shape de entrada de known-issues.md (pin A5: alineado con sdd-archive)",
  );
});

// A3 + A4: pin "**Prepend**", "newest-first", and the lazy-skip guard
test("sdd-verify/SKILL.md documenta prepend newest-first y creación lazy", () => {
  const filePath = path.join(ROOT, "skills", "sdd-verify", "SKILL.md");
  const content = readFileOrFail(filePath, "skills/sdd-verify/SKILL.md");
  assert.ok(
    content.includes("**Prepend**"),
    "sdd-verify/SKILL.md debe documentar el paso de prepend con '**Prepend**' (pin A3: Prepend)",
  );
  assert.ok(
    content.includes("newest-first"),
    "sdd-verify/SKILL.md debe documentar el orden newest-first para el prepend (pin A3: newest-first)",
  );
  // A4: lazy-skip guard — proves known-issues.md is NOT pre-created; only written on first qualifying finding
  assert.ok(
    content.includes("do NOT touch `openspec/memory/known-issues.md`"),
    "sdd-verify/SKILL.md debe documentar 'do NOT touch `openspec/memory/known-issues.md`' para la creación lazy (pin A4)",
  );
  // B5: idempotency guard must survive — composite change: + normalized heading key
  assert.ok(
    content.includes("Idempotency guard (B5)"),
    "sdd-verify/SKILL.md debe documentar el 'Idempotency guard (B5)' que evita entradas duplicadas en retry (pin B5)",
  );
  // B4: prompt-injection guard must survive, cover area/workaround, and strip per-line
  assert.ok(
    content.includes("Prompt-injection guard (B4)"),
    "sdd-verify/SKILL.md debe documentar el 'Prompt-injection guard (B4)' (pin B4)",
  );
  assert.ok(
    content.includes("begin any line within it"),
    "sdd-verify/SKILL.md B4 debe neutralizar '#' al inicio de cualquier línea, no solo en posición 0 (pin B4: line-by-line)",
  );
  assert.ok(
    content.includes("`area`, and `workaround`"),
    "sdd-verify/SKILL.md B4 debe cubrir también los campos area y workaround, no solo el summary (pin B4: campos no-heading)",
  );
});
