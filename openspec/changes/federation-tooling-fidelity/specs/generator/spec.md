# Delta for generator

## MODIFIED Requirements

### Requirement: Source tree loading ampliado

#### Scenario: Carga del árbol fuente con entry scripts de skill

- GIVEN the generator is invoked with a `sourceDir` and a set of `SOURCE_ROOTS`
- WHEN `loadTree` runs
- THEN it MUST collect files from each root that exists, recursing into directories and reading file contents as UTF-8 strings into `{ path, content }` objects
- AND it MUST additionally invoke `gatherRuntimeScripts` to include both (a) the runtime hook scripts and (b) the skill entry-point scripts listed below as additional BFS roots, resolving the full transitive `require()` closure of both groups (resolved statically by regex, no dynamic evaluation)

**Skill entry-point allowlist** (additional BFS roots alongside `hooks/*.js`):

| Script | Role |
|--------|------|
| `scripts/lib/federation-marker.js` | enroll runtime |
| `scripts/lib/federation-explore.js` | explore runtime |
| `scripts/lib/workspace-general-baseline.js` | general-baseline runtime |
| `scripts/lib/federation-baseline-orchestrator.js` | baseline-orchestrator runtime |

All four scripts and their transitive `require()` dependencies MUST be present in the dist of ALL four targets (`claude`, `vscode`, `github-copilot`, `opencode`) under `scripts/lib/`.
And it MUST NOT include test files (`.test.js`) or generator-only modules (`target-*`, `frontmatter`, `model-resolver`, `configure/`) in the runtime script bundle.
And it MUST silently skip any root that does not exist on disk.

The canonical `SOURCE_ROOTS` are:
`.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, `agents/`, `commands/`, `rules/`, `skills/`.

(Previously: `gatherRuntimeScripts` used only `hooks/*.js` as BFS roots; the four skill entry-point scripts were unreachable and absent from all packaged targets.)

#### Scenario: Skill entry-point scripts present in dist

- GIVEN the source tree contains the four skill entry-point scripts under `scripts/lib/`
- WHEN `gatherRuntimeScripts` runs during generation for any of the four targets (`claude`, `vscode`, `github-copilot`, `opencode`)
- THEN `federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, and `federation-baseline-orchestrator.js` MUST each appear in the collected runtime file set
- AND they MUST be emitted under `scripts/lib/` in the output dist

#### Scenario: Generator-only modules excluded from dist

- GIVEN the source tree contains generator modules such as `scripts/lib/target-transform.js` and `scripts/configure/cli.js`
- WHEN `gatherRuntimeScripts` collects the runtime script bundle
- THEN no file matching `target-*`, `frontmatter.js`, `model-resolver.js`, any `configure/` module, or `*.test.js` MUST appear in the output
- AND this exclusion applies regardless of whether those modules are transitively required by any non-excluded script

#### Scenario: Transitive dependency of an entry script included

- GIVEN `scripts/lib/federation-marker.js` contains a static `require('./some-dep')` call and `some-dep.js` is not itself an excluded module
- WHEN `gatherRuntimeScripts` resolves the transitive closure from `federation-marker.js`
- THEN `scripts/lib/some-dep.js` MUST also be present in the collected runtime file set
- AND resolution MUST use only static regex matching on `require()` calls — no script execution
