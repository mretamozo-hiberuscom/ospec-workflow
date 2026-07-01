"use strict";

// Path-safety guards for the Node hook layer.
// Mirrors internal/hooks/common.go validatePath and precompact.go resolveCwd so
// the JS fallback hooks enforce the same boundary the Go binary does: untrusted
// cwd / transcript_path values from hook stdin must be absolute, contain no ".."
// segment, and never resolve to a filesystem or volume root (which would steer
// .ospec/ writes outside the workspace).

const path = require("node:path");

/**
 * Validates an untrusted path the way internal/hooks/common.go validatePath does.
 *
 * @param {unknown} candidate raw value from hook input (may be non-string)
 * @returns {{ cleaned: string, ok: boolean }} cleaned absolute path when ok,
 *   otherwise { cleaned: "", ok: false }.
 */
function validatePath(candidate) {
  if (typeof candidate !== "string") {
    return { cleaned: "", ok: false };
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return { cleaned: "", ok: false };
  }

  const cleaned = path.normalize(trimmed);
  if (!path.isAbsolute(cleaned)) {
    return { cleaned: "", ok: false };
  }

  // path.normalize collapses leading ".." for absolute paths, so a surviving
  // ".." segment means traversal that could not be resolved lexically — reject.
  if (cleaned.split(/[\\/]/).includes("..")) {
    return { cleaned: "", ok: false };
  }

  // Reject filesystem / volume roots: path.dirname(root) === root holds for the
  // POSIX root, Windows drive-letter roots, and UNC shares. Accepting one as a
  // workspace root would steer writes to the filesystem root.
  if (path.dirname(cleaned) === cleaned) {
    return { cleaned: "", ok: false };
  }

  return { cleaned, ok: true };
}

/**
 * Resolves the workspace directory from an untrusted cwd, mirroring
 * internal/hooks/precompact.go resolveCwd. A rejected cwd falls back to the
 * trusted fallback rather than being resolved verbatim.
 *
 * @param {unknown} cwd raw input.cwd value
 * @param {string} fallbackCwd trusted fallback (e.g. process.cwd())
 * @returns {string} absolute workspace path
 */
function resolveWorkspaceCwd(cwd, fallbackCwd) {
  const { cleaned, ok } = validatePath(cwd);
  return ok ? cleaned : path.resolve(fallbackCwd);
}

module.exports = {
  validatePath,
  resolveWorkspaceCwd,
};
