# Skills Domain Spec

## Overview

The `skills/` tree is the catalog of runtime instruction contracts for LLMs operating
in this repository. Every entry teaches an agent — orchestrator or sub-agent — when and
how to do a specific kind of work. The domain covers the SKILL.md frontmatter contract,
the directory taxonomy, the `_shared/` convention package, and the authoring rules that
all skills must satisfy. Runtime registry build, fingerprinting, and cache management
belong to the `skill-registry` domain; cross-reference there for cache schema and
SessionStart refresh behavior.

---

## 1. Catalog Taxonomy

The catalog is organized into four tiers under `skills/`:

### 1.1 SDD Phase Skills (`skills/sdd-{phase}/SKILL.md`)

Phase skills encode the executor procedure for each SDD workflow phase. They are
loaded by sub-agents, never executed inline by the orchestrator.

Canonical set:
`sdd-apply`, `sdd-archive`, `sdd-baseline`, `sdd-clarify`, `sdd-design`,
`sdd-explore`, `sdd-foundation`, `sdd-init`, `sdd-onboard`, `sdd-propose`,
`sdd-spec`, `sdd-tasks`, `sdd-verify`, `sdd-workspace`.

Identifying traits:
- Frontmatter has `disable-model-invocation: true`, `user-invocable: false`, and
  `metadata.delegate_only: true`.
- Body begins with an `ORCHESTRATOR GATE` blockquote instructing the orchestrator to
  stop and delegate instead of executing inline.
- License is `MIT`.
- These skills are **excluded** from the registry cache — the registry scanner skips
  any skill directory whose name starts with `sdd-`.

### 1.2 Utility / Communication Skills (`skills/{name}/SKILL.md`)

Skills that encode task patterns or communication modes usable by any agent or
directly by the user. Examples: `caveman`, `branch-pr`, `chained-pr`, `skill-creator`,
`judgment-day`, `review-readability`, `go-testing`, `agent-introspection`.

Identifying traits:
- No `disable-model-invocation` or `user-invocable` override in frontmatter.
- License is typically `Apache-2.0`.
- These skills ARE indexed by the registry scanner and injected into sub-agent prompts
  as compact rules.

### 1.3 Support Package (`skills/_shared/`)

Convention documents consumed by phase skills and the registry. Not a skill that
agents invoke; it is a reference library. The `_shared/SKILL.md` marker declares the
directory non-invokable (`disable-model-invocation: true`, `user-invocable: false`).

| File | Purpose |
|---|---|
| `sdd-phase-common.md` | Shared executor protocol (skill loading §A, artifact retrieval §B, persistence §C, return envelope §D, review workload guard §E) |
| `openspec-convention.md` | Artifact path map for every SDD phase, spec ownership rules, config schema |
| `persistence-contract.md` | Mode resolution (`openspec` vs `none`), workspace federation model, sub-agent context rules |
| `skill-resolver.md` | Resolution order for injecting skills into sub-agent prompts; registry cache schema |
| `prompt-boundaries.md` | Dynamic payload block tags used when composing sub-agent prompts |
| `token-budget.md` | Per-delegation token limits for prompts and compact skill blocks |
| `approval-ledger.md` | Shape and valid sources for persisted blocking decisions in `state.yaml` |

The `_shared/` directory is excluded from registry indexing; its files contribute to
the fingerprint (see §4.2) but are never emitted as registry skill entries.

### 1.4 Stack Skills (`skills/stack-{name}/SKILL.md`)

Stack skills carry operative, per-technology knowledge — authoring conventions, framework-specific patterns, and project coding rules for a given library or runtime. They are NOT SDD-phase procedure files and MUST NOT carry the `disable-model-invocation: true`, `user-invocable: false`, or `metadata.delegate_only: true` fields.

Each stack skill MUST live at `skills/stack-{name}/SKILL.md` where `{name}` is a lowercase slug matching the technology it covers (e.g., `stack-angular`, `stack-dotnet`, `stack-postgres`).

Identifying traits:
- No `disable-model-invocation` or `user-invocable` override in frontmatter.
- License is `Apache-2.0` (matching the utility tier).
- Frontmatter description must be a meaningful description of the technology domain and key use cases to support judgment-based selection.
- Frontmatter contains the `capabilities` field.
- These skills ARE indexed by the registry scanner and injected into sub-agent prompts.

---

## 2. Frontmatter Contract

Every `SKILL.md` MUST open with a YAML frontmatter block delimited by `---`.

### 2.1 Required Fields

| Field | Type | Constraint |
|---|---|---|
| `name` | string | Slug matching the directory name |
| `description` | string | Single physical line, double-quoted, YAML-safe; MUST encode trigger words; <=160 chars SHOULD, <=250 chars MUST |
| `license` | string | `MIT` for SDD phase skills; `Apache-2.0` for utility skills |
| `metadata.author` | string | `manuel-retamozo-garcia` |
| `metadata.version` | string | Quoted semantic string (e.g., `"1.0"`, `"2.0"`) |

### 2.2 Optional Fields (SDD Phase Skills Only)

| Field | Value | Meaning |
|---|---|---|
| `disable-model-invocation` | `true` | Prevents the model from loading and executing inline |
| `user-invocable` | `false` | Marks the skill as inaccessible to direct user invocation |
| `metadata.delegate_only` | `true` | Signals the orchestrator gate: must delegate, must not execute |

### 2.3 Description Trigger Pattern

The `description` field MUST embed trigger words for the registry scanner to extract.
The canonical prefix pattern is:

```
"Trigger: <word1>, <word2>. <What the skill does>."
```

Trigger text may appear after the description prose when the prose is brief:

```
"<What the skill does>. Trigger: <word1>, <word2>."
```

The registry parser (`extractTriggers`) matches the text following `Trigger:` and
splits on `,` or `;`. If no `Trigger:` substring is found, the skill name is used as
the sole trigger. A `Keywords` field MUST NOT be added; all discovery metadata lives
in `description`.

### 2.4 Frontmatter Parsing Rules (implemented in `scripts/lib/skill-registry.js`)

Given/When/Then:

- **Given** a SKILL.md file whose content starts with `---\n`,
  **When** `parseFrontmatter` processes it,
  **Then** it returns top-level scalar key-value pairs only; indented lines (nested
  blocks such as `metadata:` sub-keys) are collected as raw continuation lines but
  not exposed as separate attributes.

- **Given** a value wrapped in single or double quotes in frontmatter,
  **When** the parser reads it,
  **Then** the surrounding quotes are stripped from the returned string value.

- **Given** a frontmatter value that is an inline YAML array (`[a, b]`),
  **When** the parser reads it,
  **Then** the value is returned as a JavaScript array of trimmed scalars.

### 2.5 Stack-Skill capabilities Frontmatter Field

Every stack-skill `SKILL.md` SHOULD declare a `capabilities:` frontmatter field whose value is a list of one or more capability name strings. These names MUST match (exactly, case-sensitive) the `name` values used in the `capabilities:` block of `openspec/config.yaml`. When the `capabilities:` field is absent, the skill MUST still be indexed; its registry entry will carry an empty `capabilities` array and the skill will not be selected by capability-based resolution.

The `capabilities:` field MUST NOT be used as a general keyword tag; it MUST list only technology names that correspond to declared project capabilities.

---

## 3. Skill Body Structure

Every skill body MUST use sections in this order (omit only sections that are truly
irrelevant):

1. **Activation Contract** — exact conditions that load or activate the skill.
2. **Hard Rules** — MUST/MUST NOT constraints the LLM cannot override.
3. **Decision Gates** — compact tables for meaningful branching choices.
4. **Execution Steps** — ordered, imperative operational workflow.
5. **Output Contract** — required return format, artifact list, or response shape.
6. **References** — local file paths only; no external URLs as primary references.

### 3.1 Body Budget

| Tier | Limit |
|---|---|
| Target | 180–450 tokens |
| Recommended max | 700 tokens |
| Hard max | 1000 tokens |

When a skill exceeds 200 lines, the registry scanner reads only frontmatter and the
`Hard Rules` / `Critical Patterns` sections for compact-rule extraction.

### 3.2 SDD Phase Skill Body Convention

SDD phase skills MUST open the body with the ORCHESTRATOR GATE blockquote before any
section heading:

```markdown
> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `{phase}` sub-agent. This skill is for EXECUTORS only.
```

Phase executor bodies reference `skills/_shared/sdd-phase-common.md` sections by
letter (§A, §B, §C, §D, §E) rather than duplicating their content.

---

## 4. Registry Integration

### 4.1 Inclusion Filter

The registry scanner (`discoverSkills` in `scripts/lib/skill-registry.js`) includes a
SKILL.md entry if and only if ALL of the following hold:
- The relative path starts with `skills/`.
- The path ends with `/SKILL.md`.
- The immediate skill directory is NOT `_shared`.
- The immediate skill directory is NOT `skill-registry`.
- The immediate skill directory does NOT start with `sdd-`.

This means only utility/communication skills are indexed; SDD phase skills and the
support package are excluded from registry entries.

### 4.2 Fingerprint Inputs

The content fingerprint that determines whether to rebuild the registry cache covers:
- Every `SKILL.md` file found under `skills/` (including excluded ones such as `sdd-*`
  and `_shared`).
- Every `.md` file under `skills/_shared/`.
- Every `.md` file under `rules/`.

The fingerprint is SHA-256 over sorted (relativePath + `\0` + fileContent + `\0`)
pairs. Any change to any of these files invalidates the cache.

### 4.3 Compact-Rule Extraction

Given/When/Then:

- **Given** the body of a SKILL.md (frontmatter stripped),
  **When** `extractCompactRules` processes it,
  **Then** it scans for `##`–`####` headings whose text matches the pattern
  `(hard|critical|core|decision)? (rules|patterns|constraints|gates)` (case-insensitive).

- **Given** a matching rules section,
  **When** the scanner reads list items (`-`, `*`, `+`, or `N.`),
  **Then** each item is stripped of its list marker and added as a compact rule.

- **Given** a table row inside a rules section,
  **When** the row is not a separator (`---`) or a header row whose first cell is
  `rule` or `gate`,
  **Then** the first two columns are joined as `col0: col1 - col2...` and added.

- **Given** no matching rules section in the body,
  **When** `extractCompactRules` exhausts the document,
  **Then** it falls back to the first 15 list items found anywhere in the body.

- **Given** more than 15 candidate rules,
  **When** extraction completes,
  **Then** only the first 15 are returned.

### 4.4 Registry Cache Location

The built cache is persisted to `.ospec/cache/skill-registry.cache.json` at the
project root. The SessionStart hook reads this cache and injects matching compact rules
into sub-agent launch prompts. See the `skill-registry` domain spec for the cache
schema and refresh protocol.

---

## 5. Supporting File Layout

A skill directory MAY include supporting subdirectories alongside `SKILL.md`:

```
skills/{name}/
├── SKILL.md              # Required
├── references/           # Optional — local docs explaining concepts or edge cases
│   └── {topic}.md
└── assets/               # Optional — templates, schemas, fixtures
    └── {file}
```

Skills MUST NOT duplicate long documentation inside `SKILL.md`; supporting detail
belongs in `references/` or `assets/`. References MUST point to local files, not
external URLs.

Some skills carry additional implementation scripts or data files (e.g.,
`caveman-compress/scripts/` contains Python utilities). These are skill-private
implementation files not consumed by the registry.

---

## 6. Authoring Rules

- `description` MUST be a single physical (unbroken) YAML line, double-quoted, with
  trigger words leading.
- A `Keywords` YAML field MUST NOT be added; all discovery information lives in
  `description`.
- Hard rules MUST be imperative and testable; background prose belongs in
  `references/`.
- External URLs MUST NOT appear as primary references in `References` sections.
- Skills MUST NOT add AI/model/tool attribution in any field or section.
- Version numbers in `metadata.version` MUST be incremented when the skill behavior
  changes meaningfully; the field is a quoted string (e.g., `"2.0"`).

---

## 7. Scenarios

### 7.1 Skill Discovery Filter

**Given** the following skill directories:
`skills/caveman/`, `skills/sdd-apply/`, `skills/_shared/`, `skills/skill-registry/`,
**When** `discoverSkills` scans them,
**Then** only `skills/caveman/SKILL.md` is included as a registry entry; the other
three are excluded by the filter but all four SKILL.md files contribute to the
fingerprint.

### 7.2 Trigger Extraction

**Given** a description `"Trigger: caveman mode, talk like caveman. Compress replies."`,
**When** `extractTriggers` processes it,
**Then** the resulting triggers array is `["caveman mode", "talk like caveman"]`.

**Given** a description with no `Trigger:` token,
**When** `extractTriggers` processes it,
**Then** the fallback trigger is the skill `name` field.

### 7.3 SDD Phase Guard

**Given** an orchestrator loading `skills/sdd-apply/SKILL.md` via the `skill()` tool,
**When** the body begins with the ORCHESTRATOR GATE blockquote,
**Then** the orchestrator MUST stop and delegate to a dedicated sub-agent; it MUST NOT
execute the instructions inline.

### 7.4 Compact-Rule Extraction from a Rules Section

**Given** a skill body containing `## Hard Rules` with three list items followed by a
`## Purpose` section with two list items,
**When** `extractCompactRules` runs,
**Then** only the three items under `## Hard Rules` are returned; the `## Purpose`
items are excluded because `Purpose` does not match the rules-section pattern.

### 7.5 Authoring Validation

**Given** a new SKILL.md whose `description` is split across two YAML lines,
**When** the frontmatter parser reads it,
  **Then** the parser reads only the first line as the value; the second line is treated
  as a continuation raw line and is NOT part of the description attribute, causing
  trigger extraction to fail silently.

### 7.6 Stack skill passes existing inclusion filter

- GIVEN a file at `skills/stack-angular/SKILL.md` exists in the plugin
- WHEN `discoverSkills` scans the `skills/` tree
- THEN `shouldIncludeSkill("skills/stack-angular/SKILL.md")` returns `true`
- AND `stack-angular` appears as an entry in the `skills` array of the generated cache

### 7.7 Stack skill excluded from SDD-phase tier conventions

- GIVEN a file at `skills/stack-dotnet/SKILL.md` with `license: Apache-2.0`
  and NO `disable-model-invocation` or `user-invocable` fields
- WHEN the registry scanner processes it
- THEN it is indexed as a normal registry entry (same as a utility skill)
- AND the ORCHESTRATOR GATE blockquote MUST NOT appear in its body

### 7.8 Seed reference skills cover the contract

- GIVEN reference stack skills `skills/stack-angular/`, `skills/stack-dotnet/`,
  and `skills/stack-postgres/` exist with valid frontmatter and body
- WHEN `discoverSkills` runs
- THEN all three appear in the registry `skills` array with non-empty `compact_rules`
  and `capabilities` arrays

### 7.9 capabilities field present and non-empty

- GIVEN a stack skill with frontmatter `capabilities: [angular]`
- WHEN the frontmatter parser reads the field
- THEN the value is available as a parseable list containing `"angular"`
- AND the registry entry for this skill carries `capabilities: ["angular"]`

### 7.10 capabilities field absent — skill still indexed, empty array in cache

- GIVEN a stack skill `SKILL.md` that has no `capabilities:` field in frontmatter
- WHEN `discoverSkills` processes it
- THEN the skill IS included in the registry with `capabilities: []`
- AND it will NOT be matched by any capability-based resolution

---

## 8. Federated Initialization & Enroll

> Promoted from change `federation-distributed-markers` (C1) on 2026-06-18.

### Requirement: sdd-init Multirepo Detection Gate

The `sdd-init` skill MUST detect when the target directory (resolved from `target_dir`
or cwd) is a workspace container: a directory that has no `.git` of its own AND has
two or more immediate children each containing `.git` (directory or file). On
detecting a container, the skill MUST return `status: blocked` with a `question_gate`
offering exactly two options: (a) proceed as a federated workspace init, or (b)
proceed as a normal single-repo init. The skill MUST NOT auto-select the federated
path without user confirmation (D2).

This check MUST run before any artifact write; if the gate is triggered, no files are
created.

#### Scenario: Container detected — blocked with federated-vs-normal gate

- GIVEN `sdd-init` targets a directory with no `.git` of its own and two or more children with `.git`
- WHEN the skill runs its detection step
- THEN it returns `status: blocked` with a `question_gate` listing `federated` and `normal` options
- AND no artifacts are written before the user responds

#### Scenario: Single-repo directory — gate not triggered

- GIVEN `sdd-init` targets a directory that has its own `.git`
- WHEN the skill runs its detection step
- THEN detection MUST NOT trigger the multirepo gate
- AND normal init flow continues

#### Scenario: Container with fewer than two child repos — gate not triggered

- GIVEN a directory with no `.git` of its own but only one immediate child with `.git`
- WHEN `sdd-init` runs detection
- THEN the multirepo gate MUST NOT fire (threshold is ≥2 children)
- AND the skill proceeds as a normal single-repo init for that child

---

### Requirement: sdd-workspace `enroll` Operation

The `sdd-workspace` skill MUST support an `enroll` operation. When invoked with
`operation: enroll` and valid member data, the skill MUST write
`openspec/federation.member.yaml` in the specified member directory. `enroll` is the
ONLY write operation `sdd-workspace` is permitted to perform on member repos; all
other member-repo interactions MUST remain read-only (D7). The `enroll` operation MUST
be idempotent and MUST be accessible only when the caller is the orchestrator.

#### Scenario: Enroll invoked — marker written, success returned

- GIVEN the orchestrator calls `sdd-workspace` with `operation: enroll` and valid member data
- WHEN the skill executes the operation
- THEN `openspec/federation.member.yaml` is written in the member directory
- AND the skill returns `status: success` with the artifact path in `artifacts`

#### Scenario: Enroll called twice with same data — idempotent, no timestamp refresh

- GIVEN `openspec/federation.member.yaml` already exists in the member directory
  with content that is byte-for-byte identical to the supplied data
- WHEN `sdd-workspace enroll` is called again with the same data
- THEN the skill returns `status: success` with no error
- AND the file is NOT rewritten
- AND `updated_at` MUST NOT be refreshed (byte-for-byte stable marker)

---

## 9. Federated Foundation

> Promoted from change `federated-foundation-orchestration` (C3) on 2026-06-19.

### Requirement: Federated Foundation Parameter Passing

Cuando opera en un espacio de trabajo federado (multirepo), la fase `sdd-foundation` acepta y utiliza los siguientes parámetros inyectados por el orquestador:
- `workspace_yaml`: Ruta física del atlas cache (`openspec/workspace.yaml`) en el coordinador.
- `parent_change`: Nombre del cambio activo en el coordinador.

#### Scenario: Parameters parsed in federated mode
- GIVEN `sdd-foundation` is launched in a federated workspace context
- WHEN the agent evaluates its parameters
- THEN it reads the path to `workspace.yaml` and maps member locations

---

### Requirement: MarkItDown Interactive Fallback Gate

Antes de iniciar las preguntas de descubrimiento, el agente ofrece la posibilidad de ingerir documentos. Si el servidor MCP MarkItDown no está disponible en el cliente actual, se detiene el flujo de ingesta y se presenta un gate interactivo al usuario mediante `vscode/askQuestions` con tres opciones de remediación:
1. **Configurar MarkItDown automáticamente**: Intentar la instalación/configuración del servidor MCP localmente.
2. **Configurar manualmente con guía**: Suspender la ingesta y proveer instrucciones paso a paso para configurar el servidor.
3. **Saltar ingesta de documentos**: Omitir la ingesta y continuar al descubrimiento manual.

#### Scenario: Interactive fallback gate triggered on missing MCP
- GIVEN `mcp__microsoft_markitdown__convert_to_markdown` is not available
- WHEN the document ingestion step is executed
- THEN the agent triggers `vscode/askQuestions` with the three setup choices
- AND waits for user input instead of falling back silently

---

### Requirement: Mapa de Contratos e Interacciones Synthesis

En modo federado, la documentación técnica del coordinador (`docs/architecture/technical-baseline.md`) debe incluir obligatoriamente la sección **"Mapa de Contratos e Interacciones"** detallando de forma estructurada qué contratos `provides` y `consumers` están definidos entre los módulos del atlas.

#### Scenario: Synthesis includes Contracts Matrix
- GIVEN the foundation documents are synthesized in federated mode
- WHEN the technical baseline is created or updated
- THEN the section "Mapa de Contratos e Interacciones" is added containing provides/consumers definitions

---

## 10. Cross-References

- `skill-registry` domain spec — registry cache schema, fingerprint algorithm,
  SessionStart refresh, and compact-rule injection protocol.
- `hooks` domain spec — SessionStart hook that triggers registry refresh.
- `routing` domain spec — how the orchestrator selects which skill to load for a given
  SDD route.
- `skills/_shared/skill-resolver.md` — full resolution order for sub-agent skill
  injection.
- `skills/skill-creator/references/skill-style-guide.md` — normative style guide for
  creating and refactoring skills.
- `capability-registry` domain spec — schema and semantics of capability names
- `skill-registry` domain spec — how `capabilities` is read from frontmatter and stored in the cache entry schema
- `agents` domain spec — how capabilities gate stack-skill injection into sub-agents

---

## Clarifications

### Session 2026-06-20

- Q: Must a stack skill's `description` frontmatter field be meaningful enough to support orchestrator judgment-based selection without an explicit domain field? → A: Yes. The `description` MUST describe the technology domain and key use cases clearly (e.g., "Angular frontend framework — components, reactive forms, routing, signals") so the orchestrator can semantically match it against task intent. There is no `domain:` field on skill frontmatter; `description` is the sole signal for judgment-based selection.
