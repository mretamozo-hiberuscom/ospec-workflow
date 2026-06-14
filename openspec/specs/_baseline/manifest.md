# Baseline Manifest

## Domain Map (batch 0 — written once, user-approved)
- generator: Build pipeline that transforms the canonical source tree into target-native file distributions (claude, vscode, github-copilot, opencode) | sources: scripts/configure/cli.js, scripts/lib/target-transform.js, scripts/lib/target-profiles/*.js, scripts/lib/frontmatter.js, scripts/lib/model-resolver.js, scripts/configure/validate-*.js, scripts/configure/claude-marketplace.js
- routing: Intent-based route dispatcher resolving SDD workflow routes and gates from openspec/config.yaml | sources: scripts/lib/route-dispatcher.js
- hooks: Runtime event hooks (SessionStart, PreToolUse, PreCompact, SubagentStop, Stop) and their support libraries | sources: scripts/hooks/*.js, hooks/hooks.json, scripts/lib/ospec-state.js, scripts/lib/artifact-store.js, scripts/lib/workspace-atlas.js
- skills: Skills catalog of SDD phase skills and utility skills with frontmatter-driven trigger and compact-rule extraction | sources: skills/**/*.md
- agents: Phase agent templates and slash-command prompt files for all SDD phases | sources: agents/*.agent.md, commands/*.prompt.md
- skill-registry: Skill discovery, fingerprinting, and JSON cache management used at SessionStart | sources: scripts/lib/skill-registry.js, .ospec/cache/
- install: Per-target installation commands (Claude marketplace, opencode, github-copilot) that build and sync the generated tree into a destination repo | sources: scripts/configure/install-claude.js, scripts/configure/install-target.js

## Entries (append-only log; latest row per domain wins)
| domain | status | batch | commit | timestamp (UTC) |
|---|---|---|---|---|
| generator | done | 1 | 59fbfe8 | 2026-06-14T12:00:00Z |
| routing | done | 2 | 59fbfe8 | 2026-06-14T14:00:00Z |
| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |
| skills | done | 4 | 59fbfe8 | 2026-06-14T16:00:00Z |
| agents | done | 5 | 59fbfe8 | 2026-06-14T17:00:00Z |
| skill-registry | done | 6 | 59fbfe8 | 2026-06-14T18:00:00Z |
| install | done | 7 | 59fbfe8 | 2026-06-14T19:00:00Z |
