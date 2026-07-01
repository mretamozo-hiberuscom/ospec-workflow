#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  resolveGitState,
  isRiskyAction,
  composeAdvisory,
} = require("./lib/git-state.js");
const {
  detectSpecDrift,
  readStagedFiles,
  matchesGlobs,
} = require("../lib/ospec-state.js");

/**
 * Regex that matches forbidden AI/model attribution.
 * Must stay in sync with rules/no-model-attribution.instructions.md.
 */
const FORBIDDEN_ATTRIBUTION_RE =
  /co-authored-by|generated (?:with|by)|🤖|claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere/i;

/** Matches `git commit` commands — used to scope Step 5c (spec drift advisory). */
const GIT_COMMIT_RE = /\bgit\s+commit\b/i;

const SHELL_TOOL_NAMES = new Set([
  "runcommand",
  "runinterminal",
  "runterminalcommand",
  "shell",
  "shellcommand",
  "terminal",
]);

const DENY_RULES = [
  {
    pattern:
      /\brm\b(?=[^\r\n;&|]*\s-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b)[^\r\n;&|]*(?:\s\/(?:\s|$)|--no-preserve-root\b)/i,
    reason: "Recursive forced deletion of the filesystem root is blocked.",
  },
  {
    pattern: /\bgit\s+push\b[^\r\n;&|]*(?:--force(?:=|\s|$)|\s-f(?:\s|$))/i,
    reason: "Force-pushing Git history is blocked.",
  },
  {
    pattern:
      /\b(?:curl|wget)\b[^\r\n]*(?:\||\|&)\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh)\b/i,
    reason: "Piping downloaded content directly into a shell is blocked.",
  },
  {
    pattern:
      /\b(?:iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\r\n]*\|\s*(?:iex|invoke-expression)\b/i,
    reason: "Piping downloaded content into PowerShell evaluation is blocked.",
  },
  {
    pattern:
      /\bremove-item\b[^\r\n;&|]*(?=[^\r\n;&|]*\s-(?:recurse|r)\b)(?=[^\r\n;&|]*\s-(?:force|fo)\b)[^\r\n;&|]*(?:[a-z]:\\(?:\s|$)|[a-z]:\/(?:\s|$))/i,
    reason: "Recursive forced deletion of a drive root is blocked.",
  },
  {
    pattern: /\bmkfs(?:\.[a-z0-9_-]+)?\b/i,
    reason: "Formatting a filesystem is blocked.",
  },
  {
    pattern:
      /\bdd\b[^\r\n;&|]*\bof\s*=\s*\/dev\/(?:sd[a-z]|nvme\d+n\d+|vd[a-z]|xvd[a-z]|disk\d+)\b/i,
    reason: "Writing raw data directly to a storage device is blocked.",
  },
  {
    pattern:
      /\b(?:format(?:\.com)?|clear-disk)\b[^\r\n;&|]*(?:[a-z]:|-\s*number\b)/i,
    reason: "Formatting or clearing a disk is blocked.",
  },
];

const ASK_RULES = [
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|i|ci)\b/i,
    reason: "Dependency installation requires user approval.",
  },
  {
    pattern: /\bgit\s+reset\b[^\r\n;&|]*--hard\b/i,
    reason: "A hard Git reset can discard local changes.",
  },
  {
    pattern: /\bgit\s+clean\b[^\r\n;&|]*\s-[a-z]*f[a-z]*\b/i,
    reason: "Git clean can permanently remove untracked files.",
  },
  {
    pattern: /\bdocker(?:\s+compose|-compose)\s+down\b/i,
    reason: "Stopping and removing Docker Compose resources requires approval.",
  },
  {
    pattern:
      /\brm\b(?=[^\r\n;&|]*\s-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b)/i,
    reason: "Recursive forced deletion requires user approval.",
  },
  {
    pattern:
      /\b(?:chmod|chown)\b[^\r\n;&|]*(?:\s-[a-z]*R[a-z]*\b|\s--recursive\b)/i,
    reason: "Recursive permission or ownership changes require approval.",
  },
  {
    pattern:
      /\bremove-item\b[^\r\n;&|]*(?=[^\r\n;&|]*\s-(?:recurse|r)\b)(?=[^\r\n;&|]*\s-(?:force|fo)\b)/i,
    reason: "Recursive forced deletion requires user approval.",
  },
  {
    pattern: /\b(?:rmdir|rd)\b[^\r\n;&|]*\s\/s\b/i,
    reason: "Recursive directory deletion requires user approval.",
  },
  {
    pattern: /\bgit\s+push\b[^\r\n;&|]*--force-with-lease\b/i,
    reason: "Force-pushing with lease still rewrites remote history.",
  },
  {
    pattern: /\b(?:shutdown|reboot|poweroff|restart-computer)\b/i,
    reason: "Restarting or shutting down the machine requires approval.",
  },
];

function normalizeToolName(toolName) {
  return String(toolName || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isShellTool(toolName) {
  return SHELL_TOOL_NAMES.has(normalizeToolName(toolName));
}

function extractCommands(toolInput) {
  if (!toolInput || typeof toolInput !== "object") {
    return [];
  }

  const commands = [];

  if (typeof toolInput.command === "string") {
    commands.push(toolInput.command);
  }

  if (Array.isArray(toolInput.commands)) {
    for (const command of toolInput.commands) {
      if (typeof command === "string") {
        commands.push(command);
      } else if (command && typeof command.command === "string") {
        commands.push(command.command);
      }
    }
  }

  return commands;
}

function findMatchingRule(command, rules) {
  return rules.find(({ pattern }) => pattern.test(command));
}

function makeDecision(permissionDecision, permissionDecisionReason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason,
    },
  };
}

function extractPaths(obj) {
  const paths = [];
  function traverse(current) {
    if (!current) return;
    if (typeof current === "string") {
      let cleaned = current.replace(/^file:\/\/\/?/, "");
      try {
        if (fs.existsSync(cleaned) && fs.statSync(cleaned).isFile()) {
          paths.push(path.resolve(cleaned));
        } else {
          const relative = path.join(process.cwd(), cleaned);
          if (fs.existsSync(relative) && fs.statSync(relative).isFile()) {
            paths.push(path.resolve(relative));
          }
        }
      } catch (err) {
        // ignore
      }
    } else if (typeof current === "object") {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          traverse(current[key]);
        }
      }
    }
  }
  traverse(obj);
  return paths;
}

const CODE_EXTENSIONS = new Set([
  ".js", ".go", ".json", ".yaml", ".yml", ".md", ".ts", ".py", ".txt", ".rs", ".c", ".cpp", ".h", ".html", ".css"
]);

function estimateTokens(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    const ext = path.extname(filePath).toLowerCase();
    if (CODE_EXTENSIONS.has(ext)) {
      return Math.round(bytes / 4);
    } else {
      return Math.round((bytes / 6) * 1.3);
    }
  } catch (err) {
    return 0;
  }
}

function findActiveChangeNameSync() {
  const changesRoot = path.join(process.cwd(), "openspec", "changes");
  try {
    if (!fs.existsSync(changesRoot)) return "unknown";
    const entries = fs.readdirSync(changesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "archive") {
        const statePath = path.join(changesRoot, entry.name, "state.yaml");
        if (fs.existsSync(statePath)) {
          const content = fs.readFileSync(statePath, "utf8");
          if (content.includes("status: active")) {
            return entry.name;
          }
        }
      }
    }
  } catch (err) {
    // ignore
  }
  return "unknown";
}

function getCumulativeTokensSync(changeName) {
  if (changeName === "unknown") return 0;
  const logPath = path.join(process.cwd(), ".ospec", "session", changeName, "token-events.jsonl");
  try {
    if (!fs.existsSync(logPath)) return 0;
    const content = fs.readFileSync(logPath, "utf8");
    let total = 0;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          const obj = JSON.parse(trimmed);
          if (typeof obj.t === "number") {
            total += obj.t;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return total;
  } catch (err) {
    return 0;
  }
}

function recordTokensSync(changeName, tokens) {
  if (changeName === "unknown" || tokens <= 0) return;
  const logDir = path.join(process.cwd(), ".ospec", "session", changeName);
  const logPath = path.join(logDir, "token-events.jsonl");
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify({ t: tokens, ts: Date.now() }) + "\n", "utf8");
  } catch (err) {
    // ignore
  }
}

function evaluateToolUse(input, opts) {
  const injectedGitRunner = opts && opts.gitRunner ? opts.gitRunner : undefined;
  const workspace = (opts && opts.workspace) || process.cwd();

  if (process.env.DISABLE_AGENT_SHIELD !== "true") {
    const paths = extractPaths(input?.tool_input);
    for (const filePath of paths) {
      const filename = path.basename(filePath).toLowerCase();
      const ext = path.extname(filePath).toLowerCase();
      
      // Bloqueo estricto (deny)
      const isSshKey = filename.startsWith("id_") && (ext === "" || ext === ".key" || ext === ".pem" || filename === "id_rsa" || filename === "id_ecdsa" || filename === "id_ed25519");
      const isGitConfig = filename === "config" && filePath.includes(path.join(".git", "config"));
      const isNpmrc = filename === ".npmrc";
      
      if (isSshKey || isGitConfig || isNpmrc) {
        return makeDecision(
          "deny",
          `Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente.`
        );
      }
      
      // Advertencia interactiva (ask) por nombre de archivo
      const isEnv = filename.startsWith(".env");
      const isSecrets = filename === "secrets.json" || filename === "credentials";
      if (isEnv || isSecrets) {
        return makeDecision(
          "ask",
          `Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?`
        );
      }

      // Escaneo de contenido para archivos < 1MB
      try {
        const stats = fs.statSync(filePath);
        if (stats.size < 1024 * 1024) { // < 1MB
          const content = fs.readFileSync(filePath, "utf8");
          
          // Tokens conocidos
          const patterns = [
            /sk-[a-zA-Z0-9]{48}/, // OpenAI API Key
            /AIzaSy[a-zA-Z0-9-_]{33}/, // Google Cloud API Key
            /AKIA[A-Z0-9]{16}/, // AWS Access Key
            /xox[baprs]-[0-9a-zA-Z]{10,48}/, // Slack Token
            /eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/ // JWT
          ];
          
          let hasSecret = false;
          for (const pattern of patterns) {
            if (pattern.test(content)) {
              hasSecret = true;
              break;
            }
          }
          
          // Contraseñas genéricas: password = "..." o similares
          const genericPassRegex = /(?:password|passwd|pass|contrase[nñ]a|secret|key|token|private_key)\s*[:=]\s*["'][^"']{6,}["']/i;
          if (hasSecret || genericPassRegex.test(content)) {
            return makeDecision(
              "ask",
              `Advertencia de seguridad: El contenido de este archivo parece contener credenciales o tokens. ¿Está seguro de permitir su lectura?`
            );
          }
        }
      } catch (e) {
        // ignore read/stat errors
      }
    }
  }

  if (process.env.DISABLE_TOKEN_ADVISOR !== "true") {
    const paths = extractPaths(input?.tool_input);
    let currentTokens = 0;
    for (const filePath of paths) {
      currentTokens += estimateTokens(filePath);
    }

    if (currentTokens > 20000) {
      return makeDecision(
        "ask",
        `El archivo solicitado excede el límite de tokens sugerido de 20,000 (${currentTokens.toLocaleString()} tokens estimados). ¿Desea continuar con su lectura?`
      );
    }

    const changeName = findActiveChangeNameSync();
    const cumulativeTokens = getCumulativeTokensSync(changeName);
    if (cumulativeTokens + currentTokens > 90000) {
      return makeDecision(
        "ask",
        `El consumo acumulado de tokens de la sesión (${(cumulativeTokens + currentTokens).toLocaleString()} tokens) excede el umbral crítico de 90,000 tokens. Se recomienda forzar una compactación antes de continuar.`
      );
    }

    if (currentTokens > 0) {
      recordTokensSync(changeName, currentTokens);
    }
  }

  const commands = extractCommands(input?.tool_input);

  // Step 5 — DENY rules fire first (only when commands are present).
  if (commands.length > 0) {
    for (const command of commands) {
      const denyRule = findMatchingRule(command, DENY_RULES);
      if (denyRule) {
        return makeDecision("deny", denyRule.reason);
      }
    }

    // Deny git commit commands whose message contains AI/model attribution.
    for (const command of commands) {
      const attributionResult = checkCommitAttribution(command);
      if (attributionResult) {
        return makeDecision("deny", attributionResult);
      }
    }
  }

  // Step 5b — Git collaboration guard (fires for write tools OR git commit
  // commands, even when the tool carries no explicit command payload).
  if (process.env.DISABLE_GIT_COLLABORATION_GUARD !== "true") {
    if (isRiskyAction(input?.tool_name, commands)) {
      const gitState = resolveGitState(injectedGitRunner);
      const onDefault =
        gitState.defaultBranch !== null &&
        gitState.currentBranch !== null &&
        gitState.defaultBranch === gitState.currentBranch;
      if (onDefault || gitState.dirty === true) {
        const advisory = composeAdvisory(
          onDefault,
          gitState.dirty,
          gitState.currentBranch
        );
        return makeDecision("ask", advisory);
      }
    }
  }

  // No commands present — allow without reaching the ASK/ALLOW pass.
  // MUST remain after Step 5b: file-write tools (Edit, Write, etc.) carry no
  // command payload, so an earlier placement would prevent Step 5b from ever
  // evaluating them. Moving this guard before Step 5b disables the git guard
  // for all file-write tools.
  if (commands.length === 0) {
    if (!isShellTool(input?.tool_name)) {
      return makeDecision("allow", "Tool did not include a command payload.");
    }
    return makeDecision("allow", "Shell tool did not include a command payload.");
  }

  // Step 5c — Spec drift advisory (always `ask`, never `deny`). Independently
  // gated by DISABLE_SPEC_DRIFT_GUARD — the same single kill switch shared
  // with SessionStart's specDrift block (see specs/hooks/spec.md). Hooks are
  // stateless per-invocation processes, so this step independently invokes
  // detectSpecDrift/readStagedFiles rather than reusing SessionStart's result.
  // Wrapped so any git/manifest failure is advisory-only and falls through to
  // Step 6 instead of blocking the tool call.
  if (process.env.DISABLE_SPEC_DRIFT_GUARD !== "true") {
    const hasCommitCommand = commands.some((command) =>
      GIT_COMMIT_RE.test(command)
    );

    if (hasCommitCommand) {
      try {
        const drift = detectSpecDrift({ workspace, gitRunner: injectedGitRunner });

        if (drift) {
          // Best-effort: when staged-file resolution fails, treat it as an
          // empty set (no overlap ⇒ no false fire) rather than throwing.
          const staged = readStagedFiles(injectedGitRunner) ?? [];
          const hits = drift.domains.filter((domain) =>
            staged.some((file) => matchesGlobs(file, domain.sources))
          );

          if (hits.length > 0) {
            const names = hits.map((domain) => domain.domain).join(", ");
            return makeDecision(
              "ask",
              `Vas a commitear con dominios de especificación derivados: ${names}. Considera ejecutar /sdd-reconcile antes de continuar.`
            );
          }
        }
      } catch (_e) {
        // Advisory only — fall through to Step 6 on any failure.
      }
    }
  }

  // Step 6 — ASK rules.
  for (const command of commands) {
    const askRule = findMatchingRule(command, ASK_RULES);
    if (askRule) {
      return makeDecision("ask", askRule.reason);
    }
  }

  return makeDecision("allow", "Command payload passed the safety policy.");
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  try {
    const decision = evaluateToolUse(await readJsonInput());
    process.stdout.write(`${JSON.stringify(decision)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        makeDecision(
          "ask",
          `The safety hook could not inspect this tool call: ${error.message}`,
        ),
      )}\n`,
    );
  }
}

/**
 * Extracts the commit message from a `git commit -m "..."` command string
 * and checks it for forbidden AI/model attribution.
 * Returns a denial reason string if attribution is found, or null if clean.
 */
function checkCommitAttribution(command) {
  if (!/\bgit\s+commit\b/i.test(command)) {
    return null;
  }

  // Extract all -m / --message arguments (may appear multiple times for multi-paragraph messages)
  const messageMatches = command.matchAll(/(?:-m|--message)\s+(?:"([^"]*)"|'([^']*)'|([^\s;|&]+))/gi);
  for (const match of messageMatches) {
    const msg = match[1] ?? match[2] ?? match[3] ?? "";
    if (FORBIDDEN_ATTRIBUTION_RE.test(msg)) {
      return `Commit bloqueado: el mensaje contiene atribución AI/modelo prohibida. Elimina líneas como 'Co-Authored-By', nombres de modelo (Claude, GPT, Gemini, etc.) y usa Conventional Commits sin atribución. Consulta rules/no-model-attribution.instructions.md.`;
    }
  }

  return null;
}

if (require.main === module) {
  void main();
}

module.exports = {
  ASK_RULES,
  DENY_RULES,
  FORBIDDEN_ATTRIBUTION_RE,
  checkCommitAttribution,
  evaluateToolUse,
  extractCommands,
  isShellTool,
  isRiskyAction,
  normalizeToolName,
  findActiveChangeNameSync,
};
