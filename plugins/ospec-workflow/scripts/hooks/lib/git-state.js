"use strict";

/**
 * git-state.js — Git collaboration guard helpers.
 *
 * Exports:
 *   resolveGitState(gitRunner?)  — three independent probes, per-field fail-open
 *   isRiskyAction(commands) — git-commit detection
 *   composeAdvisory(onDefault, dirty, branchName) — three Spanish message variants
 */

const { execFileSync } = require("node:child_process");

const TIMEOUT_MS = 5000;

const GIT_COMMIT_RE = /\bgit\s+commit\b/i;

/**
 * Default git runner: delegates to execFileSync("git", args, …).
 * Throws on non-zero exit, timeout, or binary not found.
 *
 * @param {string[]} args
 * @param {number} [timeoutMs] - per-call timeout in ms; defaults to TIMEOUT_MS
 * @returns {string} stdout as UTF-8 string
 */
function defaultGitRunner(args, timeoutMs) {
  return execFileSync("git", args, {
    timeout: typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : TIMEOUT_MS,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Resolves the three git state probes independently with per-field fail-open.
 *
 * A single 5 s shared deadline is computed once and split across all three
 * probes, so the cumulative budget cannot exceed TIMEOUT_MS regardless of
 * how long any individual probe takes. This mirrors Go's context.WithTimeout
 * approach in resolveGitState (gitstate.go).
 *
 * The runner is called as runner(args, remainingMs) so an injected runner can
 * also honour the shrinking budget. Test stubs that only accept (args) safely
 * ignore the extra argument.
 *
 * @param {function} [gitRunner] - optional (args: string[], timeoutMs?: number) => string
 * @returns {{ defaultBranch: string|null, currentBranch: string|null, dirty: boolean|null }}
 *   - defaultBranch: null when probe fails or origin/HEAD is not configured
 *   - currentBranch: null when probe fails or HEAD is detached (empty output)
 *   - dirty: true (non-empty porcelain), false (empty porcelain), null (probe failed)
 */
function resolveGitState(gitRunner) {
  // Single shared deadline: all three probes together must complete within TIMEOUT_MS.
  // Mirrors Go: context.WithTimeout(ctx, 5*time.Second) passed to all three probes.
  const deadline = Date.now() + TIMEOUT_MS;

  const useDefault = typeof gitRunner !== "function";
  const runner = useDefault ? defaultGitRunner : gitRunner;

  /** Returns the remaining budget (minimum 1 ms). */
  function remaining() {
    return Math.max(1, deadline - Date.now());
  }

  let defaultBranch = null;
  let currentBranch = null;
  let dirty = null;

  // Probe 1: default branch via origin/HEAD symbolic ref
  try {
    const output = runner([
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "--short",
    ], remaining()).trim();
    // "origin/main" → strip "<remote>/" prefix → "main"
    defaultBranch = output.replace(/^[^/]+\//, "") || null;
  } catch (_e) {
    defaultBranch = null;
  }

  // Probe 2: current branch (empty = detached HEAD)
  try {
    const output = runner(["branch", "--show-current"], remaining()).trim();
    currentBranch = output || null;
  } catch (_e) {
    currentBranch = null;
  }

  // Probe 3: working tree state via --porcelain (non-empty = dirty)
  // dirty stays null only when this probe fails — never falsely reports clean.
  try {
    const output = runner(["status", "--porcelain"], remaining());
    dirty = output.trim().length > 0;
  } catch (_e) {
    dirty = null;
  }

  return { defaultBranch, currentBranch, dirty };
}

/**
 * Returns true when the action is "risky" — i.e. any extracted command
 * matches `git commit`. File-write tools (Edit, Write, etc.) are no longer
 * considered risky on their own: the guard now behaves like a pre-commit
 * check rather than firing on every edit.
 *
 * @param {string[]} commands
 * @returns {boolean}
 */
function isRiskyAction(commands) {
  if (Array.isArray(commands)) {
    for (const cmd of commands) {
      if (typeof cmd === "string" && GIT_COMMIT_RE.test(cmd)) return true;
    }
  }
  return false;
}

/**
 * Sanitizes a branch name before interpolation into advisory strings to
 * prevent prompt injection via hostile branch names.
 *
 * Strips C0/C1 control characters (0x00-0x1F, 0x7F), collapses whitespace,
 * and truncates to 120 code points with an ellipsis.
 * Identical logic is applied in composeAdvisory (gitstate.go) — keep in sync.
 *
 * @param {string|null} name
 * @returns {string}
 */
function sanitizeBranchName(name) {
  if (!name) return name;
  // Strip C0/C1 control characters and DEL
  // eslint-disable-next-line no-control-regex
  let s = name.replace(/[\x00-\x1f\x7f]/g, "");
  // Collapse any remaining whitespace sequences to a single space
  s = s.replace(/\s+/g, " ").trim();
  // Truncate to 120 Unicode code points
  const codePoints = [...s];
  if (codePoints.length > 120) {
    s = codePoints.slice(0, 120).join("") + "…";
  }
  return s;
}

/**
 * Builds the advisory message (Spanish) for the git-collaboration guard.
 * Three variants depend on which conditions hold:
 *   combined     — onDefault=true  AND dirty=true
 *   default-only — onDefault=true  AND dirty != true
 *   dirty-only   — onDefault=false AND dirty=true
 *
 * @param {boolean} onDefault    - current branch == default branch
 * @param {boolean|null} dirty   - null = probe failed; false = clean; true = dirty
 * @param {string|null} branchName
 * @returns {string}
 */
function composeAdvisory(onDefault, dirty, branchName) {
  const isDirty = dirty === true;
  const isOnDefault = onDefault === true;
  const branch = sanitizeBranchName(branchName) || "la rama por defecto";

  if (isOnDefault && isDirty) {
    return (
      `Estás en la rama por defecto '${branch}' y el árbol de trabajo tiene cambios sin commitear. ` +
      `Crea una rama de feature (<tipo>/<descripción>) y haz commit o stash de los cambios antes de continuar.`
    );
  }

  if (isOnDefault) {
    return (
      `Estás en la rama por defecto '${branch}'. ` +
      `Crea una rama de feature (<tipo>/<descripción>) antes de realizar cambios en el código.`
    );
  }

  if (isDirty) {
    return (
      `El árbol de trabajo tiene cambios sin commitear. ` +
      `Haz commit o stash de los cambios antes de continuar.`
    );
  }

  // Guard: should not be called unless at least one condition holds.
  return "";
}

module.exports = { resolveGitState, isRiskyAction, composeAdvisory };
