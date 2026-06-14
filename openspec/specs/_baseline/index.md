# Baseline Index
source: local
<!-- append-first: one line per domain on completion; never rebuilt -->
- generator: build pipeline transforming source plugin tree into 4 target distributions → ../generator/spec.md
- routing: intent-based route dispatcher selecting SDD workflow profiles from a declarative YAML routing table → ../routing/spec.md
- hooks: five Claude lifecycle event hooks (SessionStart, PreToolUse, PreCompact, SubagentStop, Stop) managing skill-registry refresh, tool safety, session state persistence, and degraded-resolution observability → ../hooks/spec.md
- skills: skill catalog taxonomy (SDD phase skills, utility skills, _shared support package), SKILL.md frontmatter contract, trigger/compact-rule extraction, and registry inclusion filter → ../skills/spec.md
- agents: three-role agent catalog (orchestrator, SDD phase executors, 4R reviewers), agent frontmatter contract, executor-vs-coordinator boundary, result envelope, and per-target transformation rules → ../agents/spec.md
- skill-registry: fingerprint-based JSON cache lifecycle for the skill catalog — discovery filter, compact-rule and trigger extraction, SHA-256 staleness detection, atomic write, SessionStart refresh/reuse logic, and federated workspace embedding → ../skill-registry/spec.md
- install: per-target installation commands and distribution model — Claude marketplace build/register/update cycle, opencode and github-copilot filesystem-sync, safety guards on output and destination paths, idempotency contract, and real-repo plus E2E test coverage → ../install/spec.md
