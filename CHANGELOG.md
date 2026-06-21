# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Plugin version tracks `.plugin.json` and `.claude-plugin/plugin.json`.

## [Unreleased]

## [2.6.0] - 2026-06-22

### Added
- **Orchestrator Body Partitioning — CORE vs. circunstanciales**: Extracción de 5 bloques circunstanciales a archivos markdown puros de prosa bajo `skills/_shared/` (`route-brownfield.md`, `gate-4r-review.md`, `route-federation.md`, `dispatch-lifecycle-hooks.md`, `gate-archive-quality.md`) para optimizar el presupuesto de tokens.
- **Tabla de punteros en CORE**: Introducción de la sección `### Circumstantial Handler Pointer Table` en el orquestador (`agents/sdd-orchestrator.agent.md`) como punto único de resolución e importación bajo demanda para los handlers.
- **Test Estructural**: Incorporación del test estructural de integración `"real repo: orchestrator pointer-table refs resolve and handler sentinels absent from body"` en `scripts/configure/real-repo.test.js` para asegurar que el cuerpo del orquestador no exceda las 700 líneas y no contenga sentinelas inline de los handlers circunstanciales.

### Changed
- **Reducción de tamaño del CORE**: Reducción del cuerpo del orquestador en un **38% (de 986 a 607 líneas)**, cumpliendo con la meta de diseño.
- **Regeneración de Targets**: Actualización automática de los 4 targets generados (`claude`, `vscode`, `github-copilot`, `opencode`) propagando la tabla de punteros y los archivos `_shared/`.
- **Integración de Tests de Federation**: Adaptación de los tests de contrato de federación preexistentes para tolerar la distribución física de lógica en los archivos compartidos.

## [2.5.0] - 2026-06-21

### Added
- **Quality Gates declarativos** (`declarative-quality-gates`): nuevo bloque opcional `quality_gates:` en `openspec/config.yaml` evaluado por `sdd-verify` tras los pasos de test/build. Cuatro slots tipados (`tests`, `lint`, `architecture`, `security`) con campos `required`, `on_fail` (`advisory` por defecto | `halt`), `command` y `timeout_ms`. La ausencia del bloque es un no-op estricto: el comportamiento de verify es idéntico al baseline previo.
- **Núcleo de decisión puro `scripts/lib/quality-gates.js`** (sin I/O, espejo de `lifecycle-hooks.js`): `parseQualityGates`, `validateQualityGates`, `parseCoverage`, `classifyCoverage`, `classifyGate`, `enforceGate`, `aggregateStatus` y `buildAuditBlock`. Cubierto por 69 pruebas unitarias bajo TDD estricto.
- **Auditoría por gate en dos destinos**: tabla `## Quality Gates` en `verify-report.md` y bloque `gates.quality-gates` en `state.yaml` (hermano de `clarify` y `4r-review-gate`), escrito solo cuando hay política declarada.
- **Override de archivado con auditoría obligatoria**: el usuario puede forzar el archivado pasando un gate `halt` fallido mediante una justificación escrita, registrada en `state.yaml` (`gates.quality-gates.override`) y en `verify-report.md` con timestamp.
- **Migración de cobertura**: `quality_gates.tests.coverage.minimum` supersede a `rules.verify.coverage_threshold` cuando el bloque está declarado; al estar ausente, el campo legacy permanece activo (aditivo, retrocompatible).

### Changed
- **`sdd-verify` (SKILL + agente)**: nuevo paso 9a de evaluación de gates con ejecución acotada por `timeout_ms`, superficie de errores de validación, y escritura de auditoría *fail-closed* con read-back (envelope `blocked` ante fallo de persistencia).
- **`sdd-orchestrator`**: nuevo Archive Dispatch Guard *policy-aware* que lee config + `state.yaml` + envelope de verify, y confirmación de override en dos lugares antes de despachar `sdd-archive`.
- **`openspec-convention.md`**: documentación del bloque `gates.quality-gates`, el estado `error`, la asimetría de nombres `quality_gates`/`quality-gates` y el orden de las reglas de agregación.

### Security
- **Frontera de confianza de comandos de gate** (mirroring `run-command` de lifecycle hooks): los strings `command`/`coverage.command` se ejecutan con privilegio completo vía `sdd-verify` y fluyen por la evaluación `PreToolUse` DENY/ASK. Documentado que deben tratarse como configuración versionada y de confianza, sin secretos inline (usar variables de entorno o referencias a secret-manager).

### Fixed
- **Remediación 4R-CRITICAL** (cierre de bypass silencioso de archivado): una escritura de auditoría fallida en `state.yaml` con `sdd-verify` devolviendo `status: success` permitía al orquestador leer el gate como "ausente" y despachar el archivado saltándose un gate `halt` requerido. Cerrado por dos capas independientes — escritura *fail-closed* con read-back (H1) y guard *policy-aware* en el orquestador (H2) —; el override de medio escribir se cierra exigiendo confirmación en ambos destinos (H3). Estado `error` distinto para fallos de herramienta/timeout (H4/H5) y validación de rango de cobertura sin clamp (H6).

## [2.4.9] - 2026-06-21

### Added
- **Memoria Operativa del Proyecto** (`project-operative-memory`): se agrega soporte para la memoria operativa del proyecto en la carpeta `openspec/memory/` con contratos específicos de lectura y escritura por fase.
- **Stub de convenciones**: se crea `openspec/memory/conventions.md` con un preámbulo claro y un aviso de curación manual para los agentes.
- **Suite de pruebas estáticas**: se añade `scripts/operative-memory-contract.test.js` con 16 pruebas unitarias bajo TDD estricto que garantizan la integridad de las cláusulas y tablas de la memoria.

### Changed
- **`sdd-phase-common.md`**: se actualiza con un patrón de inicialización de 3 pasos (cargar skill, cargar protocolo compartido, leer ficheros de memoria operativa designados), la tabla de lectura por fase y la tabla de propiedad.
- **`sdd-archive`**: se añade el paso 4 para persistir decisiones resueltas (con estado `resolved`) desde `state.yaml` a `openspec/memory/decisions.md` (anteponiendo de forma reverse-chronological e implementando salvaguardas de sanitización/idempotencia).
- **`sdd-verify`**: se añade el paso 10b para persistir hallazgos mapeados como WARNING o BLOCKER en `openspec/memory/known-issues.md` (con sanitización/idempotencia).

## [2.4.8] - 2026-06-20

### Added
- **Sistema de capacidades tecnológicas** (`capability-stack-skills`): el harness ahora activa skills de stack de forma declarativa según el bloque `capabilities:` de `openspec/config.yaml`. El hook `session-start` lee las capacidades activas y las expone en su resultado; el registro de skills incluye el campo `capabilities` en cada entrada.
- **Nuevo módulo puro `capability-registry.js`**: parsea el bloque YAML de capacidades sin ningún efecto secundario (sin I/O, sin dependencias externas). Expone `parseCapabilities`, `capabilityNames` y `matchStackSkills` con validación exhaustiva de entradas y contrato de pureza formal documentado.
- **30+ nuevas skills tecnológicas** estandarizadas bajo la convención `stack-*` con frontmatter completo (`capabilities`, `license: Apache-2.0`, `metadata.author`, `metadata.version`):
  - Frontend: `stack-angular` (con 35 referencias completas de la API Angular 20), `stack-react`, `stack-react-testing`, `stack-react-performance`, `stack-vite`
  - Backend JVM: `stack-springboot`, `stack-springboot-security`, `stack-springboot-tdd`, `stack-springboot-verification`, `stack-kotlin`, `stack-kotlin-coroutines-flows`, `stack-kotlin-exposed-patterns`, `stack-kotlin-ktor-patterns`, `stack-kotlin-testing`, `stack-java`
  - Backend otros: `stack-go`, `stack-go-testing` (renombrado de `go-testing`), `stack-python`, `stack-python-testing`, `stack-dotnet`
  - Infraestructura/Datos: `stack-postgres`, `stack-sqlserver`, `stack-kafka`
  - Transversales: `accessibility`, `api-design`, `hexagonal-architecture`, `tdd-workflow`, `backend-patterns`, `frontend-patterns`, `design-system`, `ai-first-engineering`, `ai-regression-testing`, `architecture-decision-records`, `agent-harness-construction`, `agent-self-evaluation`

### Changed
- **`skill-registry.js`**: añade extracción del campo `capabilities` en cada entrada del registro mediante `extractCapabilities`; exporta `collectFiles` y `extractCapabilities` para facilitar las pruebas unitarias.
- **`session-start.js`**: integra `resolveWorkspaceCwd` de `pathsafe.js` para proteger contra path traversal en la resolución del workspace; aplana la lógica de seguridad del Agent Shield extrayendo `checkUnignoredEnvFiles` y `checkEmbeddedCredentials` como helpers independientes.

### Fixed
- **I/O resiliente en `skill-registry.js`**: lecturas asíncronas de archivos en `discoverSkills` y `calculateFingerprint` envueltas en `try/catch`; errores `ENOENT` se absorben con un warning en lugar de crashear (concurrencia segura ante archivos eliminados durante el escaneo).
- **Enmascaramiento de errores en `writeRegistryCache`**: introducido flag `writeFailed` para garantizar que las excepciones del bloque de limpieza `finally` no oculten el error original de escritura o renombrado.
- **Tolerancia a fallos de configuración en `artifact-store.js`**: la lectura inicial en `createArtifactStoreFromConfig` ahora captura errores de sistema de archivos (ej. `EISDIR`, `EACCES`) y degrada graciosamente al modo por defecto en lugar de propagar la excepción.
- **Control de excepciones de I/O en `session-start.js`**: las lecturas de `.gitignore` y `.git/config` absorben únicamente `ENOENT`; otros códigos de error (ej. `EACCES`) se loguean como warnings en lugar de ignorarse en silencio.

## [2.4.7] - 2026-06-20

### Security
- Integración de **AgentShield Security** en los hooks `SessionStart` y `PreToolUse`. Valida de forma proactiva archivos `.env*` y `.npmrc` sin ignorar en `.gitignore`, así como credenciales expuestas en `.git/config` (SessionStart). Bloquea accesos no permitidos a claves SSH, `.npmrc` y `.git/config` local, y consulta interactivamente sobre secretos o API keys en ficheros < 1MB (PreToolUse). Bypass vía `DISABLE_AGENT_SHIELD=true`.

### Added
- Integración de **Token Budget Advisor** en los hooks `PreToolUse` para controlar el volumen de tokens de la sesión (límite por fichero de 20k, límite acumulado de sesión de 90k en `.ospec/session/<changeName>/token-events.jsonl`). Bypass vía `DISABLE_TOKEN_ADVISOR=true`.
- Hook de Git `pre-commit` (instalable idempotentemente vía `npm run setup:git-hooks` usando `scripts/setup-git-hooks.js`) que valida la integridad del workspace corriendo `check.js` y bloquea commits que violen el ciclo **Strict TDD** (cambios de producción staged que carezcan de test o checklist staged). Bypass vía `DISABLE_OSPEC_PRECOMMIT=true`.
- Defensa en tres capas contra la **atribución de modelo/IA en commits**: regla `PreToolUse` DENY que intercepta `git commit` y escanea el mensaje antes de ejecutarse (sin bypass); hook de Git `commit-msg` (también instalado por `npm run setup:git-hooks`) que rechaza trailers de atribución y nombres de vendor/modelo, con bypass vía `DISABLE_OSPEC_ATTRIBUTION_CHECK=true`; y la capa pasiva de reglas existente.
- Diagrama arquitectónico de flujos del arnés en `docs/harness-runtime.md` y diagrama del ciclo y rutas de workflows en `docs/sdd-workflows.md` usando imágenes PNG.

### Fixed
- Frontmatter generado inválido: `setScalar` (`scripts/lib/frontmatter.js`) ahora entrecomilla los valores escalares que romperían el YAML plano (`: ` interno, indicadores iniciales, comentarios, etc.). El comando `sdd-workspace`, cuya `description` contiene `atlas: scaffold`, generaba frontmatter que el cargador descartaba en silencio (el comando se cargaba sin metadata); el target `github-copilot` ya no pre-entrecomilla `applyTo` para evitar doble comillado.
- Test de consumo acumulado en `pre-tool-use.test.js`: corregido mock de cambio activo temporal para evitar bypass de límites en entornos sin cambios activos en desarrollo.

### Changed
- Sincronización y auditoría de la documentación general (`README.md`, `harness-runtime.md`, `tdd-y-revision.md`, `comparacion-arneses.md`) eliminando las propuestas obsoletas de oportunidades de mejora técnica ya implementadas.

## [2.4.6] - 2026-06-19

### Security
- Paridad de validación de rutas entre el binario Go y los hooks JS: nuevo `scripts/lib/pathsafe.js` que replica `validatePath`/`resolveCwd`. Los hooks `subagent-stop`, `stop` y `pre-compact` ahora rechazan rutas relativas, con `..` o raíces del sistema de ficheros en `cwd` y `transcript_path`, evitando lectura fuera de límites y escritura dirigida a la raíz.

### Fixed
- Pérdida de datos en `caveman-compress`: la escritura del fichero comprimido es ahora atómica (`os.replace`); si falla, el original queda intacto y se elimina el backup para no bloquear un reintento.
- `federation-baseline-orchestrator`: `loadStatus` ya no convierte cualquier error de I/O en estado vacío (solo `ENOENT`), evitando reinicios silenciosos del progreso de baseline de todos los miembros.
- Iteración no determinista en `subagentstop.go`: las claves del map se ordenan antes de recorrerlas, garantizando una resolución de skill estable entre ejecuciones.
- Escrituras atómicas en `artifact-store.js` (`workspace.yaml`), `stop.js` (`latest.md`) y `federation-marker.js` (sin ficheros `.tmp` huérfanos en fallos de rename).
- `JSON.parse` con contexto de fichero en `target-transform.js` e instaladores globales (`install-global-opencode`, `install-global-copilot`), que ahora fallan con un mensaje accionable en vez de un `SyntaxError` opaco.
- `caveman-compress`: `call_claude` cae al CLI ante cualquier fallo del SDK (no solo `ImportError`) y trunca stderr; `validate` valida la existencia de los paths; salida forzada a UTF-8 para evitar `UnicodeEncodeError` en consolas Windows.

### Added
- Cobertura de tests para el paquete Python `caveman-compress` (`scripts/test_caveman.py`, 10 casos sobre backup-guard, retry-restore, escritura atómica, fallback del SDK y clasificación) y test de la rama de error de `jsonio.ReadInput`.

### Changed
- Refactor de legibilidad: extracción de helpers para aplanar el anidamiento en `route-dispatcher.js`, `store.go` y `ospec-state.js`; eliminación de variables muertas y de un IIFE en el código Go, y renombrados menores (`os2` → `goos`).

## [2.4.5] - 2026-06-19

### Added
- Ruteo de modelos para el target VS Code: habilitado el parámetro `model: true` en el perfil `vscode.js` para inyectar los modelos resueltos de `models.yaml` en el frontmatter de los agentes generados en `dist/vscode/`.
- Scripts de configuración automatizada: añadidos los comandos `"setup:vscode"`, `"setup:copilot"`, y `"setup:opencode"` para compilar y configurar automáticamente los targets locales y globales.
- Configuración automática de VS Code: el script `install-vscode.js` localiza y actualiza la ruta del plugin en el archivo `settings.json` del usuario (tanto para VS Code normal como Insiders), generando un backup previo.
- Robustez en instaladores globales: los instaladores de OpenCode y Copilot CLI ahora crean de forma recursiva sus directorios globales si no existen en el sistema.
- Comandos de recarga unificados: registrados `"reload:vscode"`, `"reload:copilot"` y `"reload:opencode"` para facilitar el ciclo de desarrollo.

## [2.4.4] - 2026-06-19

### Added
- Soporte para instalación global en `opencode`: añadido el script `npm run install:global:opencode` que compila el target, copia binarios, agentes, comandos, skills, instrucciones y plugins directamente en `~/.config/opencode/` e integra de forma automática los servidores MCP y reglas en `opencode.json`.
- Renombrado del agente en `opencode`: se traduce automáticamente `sdd-orchestrator` a `ospec-workflow` para mejorar la integración visual y el autocompletado con Tab en el cliente de OpenCode.
- Documentación detallada en el `README.md` y en `docs/plugin-installation.md` explicando las dos modalidades de instalación (local y global).

## [2.4.3] - 2026-06-19

### Fixed
- Claude agent visibility in VS Code: preserved `user-invocable: false` in the generated Claude agent frontmatter (previously stripped), preventing duplicate agent entries in VS Code and direct user-invocation in Claude Code.
- Setup tool resilience: updated `install-claude.js` and `cli.js` to fallback to Microsoft WinGet local package directories to find `claude.exe` when it is not present in the system PATH.
- Validator CLI compatibility: removed the unsupported `--strict` flag from the `claude plugin validate` command execution in `claude.js` profile, avoiding validation failures on standard installations.

## [2.4.2] - 2026-06-19

### Added
- Capability routing at launcher level (`ospec-hooks-launch.js`): Bypasses the Go binary and delegates to Node.js JS fallbacks for `session-start`, `pre-compact`, and `stop` hooks when running in `workspace-federated` backend mode.
- Hot path performance protection: skips configuration checks entirely for `pre-tool-use` and `subagent-stop` to avoid any I/O latency.
- Full unit test coverage in `ospec-hooks-launch.test.js` validating the routing logic and edge cases.

## [2.4.1] - 2026-06-16

### Fixed
- Hook runtime delivery: `hooks.json` invoked the compiled `ospec-hooks` binary
  directly, but that binary is gitignored and the publish workflow never built or
  bundled it, so it never reached the `release` branch — every install from
  `release` got a `hooks.json` pointing at a missing binary and all five hooks
  failed (`ospec-hooks: No such file or directory`). Hooks now run through
  `scripts/hooks/ospec-hooks-launch.js`, a Node launcher that prefers the
  per-platform Go binary and falls back to the Node hooks when none ships for the
  host. `publish-marketplace.yml` cross-compiles all four platform binaries
  (windows/amd64, darwin/arm64, darwin/amd64, linux/amd64) into the published tree.

## [2.4.0] - 2026-06-15

### Added
- `opencode` (opencode.ai / SST) target for the multi-target generator. Transforms
  the canonical source into opencode's native layout, verified against the official
  docs: agents to `.opencode/agents/*.md` (`mode: primary|subagent`, `tools:` as a
  map, `provider/model` slugs), commands to `.opencode/commands/*.md` (keep `agent:`
  routing; `${input:name}` → positional `$1`/`$2`, `${input}` → `$ARGUMENTS`), rules
  to `.opencode/instructions/*.md` referenced from `opencode.json`, and MCP folded
  into `opencode.json` (`mcp` with `type: local|remote`; VS Code `${input:NAME}`/
  `${NAME}` placeholders in env/header values rewritten to opencode's `{env:NAME}`).
  Because opencode has no
  shell-command hooks, the SDD runtime (`session-start` / `pre-tool-use`) is bridged
  through a JS plugin at `.opencode/plugins/ospec.js`. Gated by a dedicated Node
  validator (`scripts/configure/validate-opencode.js`) plus golden fixtures, wired
  into `node scripts/check.js`. Adds the `opencode` column to `models.yaml`.
- Phase `sdd-clarify` between `spec` and `design` to resolve design decisions early.
- GPT model routing tiers for `opencode` target in `models.yaml`.

### Changed
- Migrated the 5 hooks from JavaScript to a compiled Go binary (`ospec-hooks`), enhancing hook performance and robustness.
- Added path traversal validation for `transcript_path` and `cwd` inside the hooks runner.
- Handled hook event concurrency with file-based locking.
- Simplified installation with single commands per target (e.g. `npm run setup:claude`).
- Hardened multi-OS validation and workflow concurrency in CI.
- Unified routing dispatcher with intent-based routing and 4R review gate.

## [2.3.0] - 2026-06-12

### Fixed
- Claude target tool grants now match the official Claude Code tools reference.
  The `edit` abstract tool mapped only to `Edit` (modify-existing), so every phase
  agent was granted a toolset that could not create the artifacts its own prose
  tells it to `Write` (`proposal.md`, `design.md`, `tasks.md`, spec deltas, source
  and test files). `edit` now expands to `["Edit", "Write"]`, mirroring the existing
  `search → ["Grep", "Glob"]` one-to-many mapping.

### Changed
- `execute` maps to `["Bash", "PowerShell"]` for the Claude target so test and build
  commands run cross-OS: on Windows without Git Bash the `Bash` tool is unavailable
  and `PowerShell` is the native shell tool. Where one shell tool is absent it is
  simply not loaded, so the grant is harmless. Aligns the agent toolsets with the
  existing multi-OS validation workflow.

## [2.2.0] - 2026-06-12

### Added
- Multi-target plugin compatibility: a dependency-free generator
  (`scripts/configure/cli.js`) that transforms the canonical VS Code source into
  native trees for three targets — `claude` (a `.claude-plugin` bundle, gated by
  `claude plugin validate --strict`), `github-copilot` (the `.github/` layout:
  `agents/`, `prompts/`, `instructions/`), and `vscode` (identity). Includes a
  pure `target-transform` with declarative per-target profiles, context-aware
  tool-name substitution, path remapping and artifact drops, a tier-based
  `models.yaml` resolver, frontmatter helpers, the Claude orchestrator delivered
  as a skill, and committed golden fixtures. The source is never mutated; VS Code
  keeps loading it directly.
- YAML frontmatter (`name`, `description`) on the `agent-introspection` and
  `harness-audit` skills so the plugin validator stops warning.
- Brownfield bootstrap path: `sdd-baseline` agent, command, and skill to seed
  `openspec/specs/` with current-behavior specs in resumable per-domain batches.
- Baseline Advisory gate in the orchestrator for brownfield repos.
- Validation harness hardening: `node scripts/check.js` is now the single local
  and CI verification entry point, running native tests and generating GitHub
  Copilot output through the profile-level validator.
- GitHub Copilot distribution validator for required `.github/` layout, hook
  schema, frontmatter semantics, forbidden plugin residue, placeholder leaks,
  local absolute paths, and unexpected Markdown suffixes.
- Multi-OS GitHub Actions workflow (`validate-harness.yml`) covering Ubuntu,
  Windows, and macOS with Node.js 22.
- Canonical OSS files: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, and this changelog.

### Fixed
- Installation docs drift: hooks are Node.js (not PowerShell) and the MCP
  surface documents both Context7 and MarkItDown.
- P0 harness safety: removed legacy `.atl` registry inheritance from runtime
  guidance, unified skill registry cache resolution, and hardened PreToolUse
  command inspection for unknown tools carrying command payloads.
- GitHub Copilot validation robustness: required paths now check file vs
  directory type before traversal, and residue checks catch case-insensitive
  `vscode` references.

## [2.1.0] - 2026-06-11

### Added
- Configurable model routing via `profiles/models/{default,cheap,premium}.yaml`;
  agents no longer hardcode a model name.
- Runtime lifecycle hooks (`SessionStart`, `PreToolUse`, `PreCompact`,
  `SubagentStop`, `Stop`) with a Node.js runtime under `scripts/hooks/` and a
  native `node --test` suite.
- Governance: blocking approvals persisted in `state.yaml` and delimited prompt
  boundaries separating intent, artifacts, standards, and approval context.
- Minimal default MCP policy (Context7 + MarkItDown), documented in
  `docs/mcp-policy.md`.

### Changed
- README documents the plugin runtime and standard/lite/fast-forward workflows.

## [2.0.0] - 2026-06-10

### Added
- Spec-Driven Development workflow as a VS Code Agent Plugin: `sdd-orchestrator`
  coordinator plus phase agents (`explore`, `propose`, `spec`, `design`, `tasks`,
  `apply`, `verify`, `archive`) and `sdd-foundation` for greenfield discovery.
- OpenSpec as the versionable source of truth for each change.
- Interactive workflow gates through `vscode/askQuestions`.
- Strict TDD mode when the project exposes a compatible test runner.

[Unreleased]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.5...HEAD
[2.4.5]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.4...v2.4.5
[2.4.4]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/releases/tag/v2.0.0
