"use strict";

// Declarative Claude Code target profile. Consumed by target-transform.js;
// all per-target format knowledge lives here so preview-format churn touches
// one file. See design.md "Target profile object".

module.exports = {
  id: "claude",
  agentFile: { from: ".agent.md", to: ".md" },
  commandFile: { from: ".prompt.md", to: ".md" },
  manifest: {
    location: ".claude-plugin/plugin.json",
    // string component paths Claude discovers by convention -> omit them
    omitFields: ["agents", "commands", "skills", "hooks", "mcpServers"],
    dropFields: ["rules"],
  },
  hooks: { shape: "nested", location: "hooks/hooks.json" },
  frontmatter: {
    stripKeys: ["target", "user-invocable", "disable-model-invocation"],
    // Claude commands are flat skills: `agent:`/`context:` routing keys are inert,
    // so strip the routing key rather than emit dead frontmatter.
    commandStripKeys: ["agent"],
  },
  toolMap: {
    "vscode/askQuestions": "AskUserQuestion",
    read: "Read",
    // Claude splits file mutation into Edit (modify existing) + Write (create/overwrite).
    // The abstract `edit` conflates both, and every phase agent's prose says "Write
    // <artifact>" for files that do not exist yet, so grant both or agents cannot
    // create their artifacts. Prose references collapse to the primary (Edit).
    edit: ["Edit", "Write"],
    // On Windows without Git Bash, the Bash tool is unavailable and PowerShell is the
    // native shell tool; grant both so test/build commands run cross-OS. Where one is
    // absent it is simply not loaded (harmless). Prose references collapse to Bash.
    execute: ["Bash", "PowerShell"],
    search: ["Grep", "Glob"],
    agent: "Agent",
  },
  commandVars: { positional: "$ARGUMENTS", named: "arguments-frontmatter" },
  model: { format: "alias" },
  // Claude plugins do not load CLAUDE.md and sub-agents are one-shot workers, so the
  // orchestrator persona ships as a SKILL (the documented context-loading vehicle).
  rules: { strategy: "inline-into-orchestrator" },
  orchestrator: {
    agent: "sdd-orchestrator",
    emitAs: "skill",
    skillPath: "skills/sdd-orchestrator/SKILL.md",
    description:
      "SDD orchestrator — coordinate phases, delegate to the sdd-* phase agents, enforce review/TDD gates, and persist OpenSpec state. Load for any /sdd-* or spec-driven workflow request.",
  },
  // argv form, run with shell:false (see github-copilot profile). The external
  // `claude` binary must be invocable by this exact name on PATH.
  validate: ["claude", "plugin", "validate", "--strict", "{out}"],
};
