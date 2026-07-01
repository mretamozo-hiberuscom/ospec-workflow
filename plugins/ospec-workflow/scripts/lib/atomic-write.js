"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * Restores an orphaned target.bak to target if target is absent.
 * @param {string} targetPath
 */
async function recoverOrphanBak(targetPath) {
  const bakPath = targetPath + ".bak";
  try {
    const targetExists = await fs.stat(targetPath).then(() => true, () => false);
    if (!targetExists) {
      const bakExists = await fs.stat(bakPath).then(() => true, () => false);
      if (bakExists) {
        await fs.rename(bakPath, targetPath);
      }
    }
  } catch (error) {
    // Ignore recovery errors, but let it fail open or log if critical.
  }
}

/**
 * Writes content to targetPath atomically using temp + rename.
 * @param {string} targetPath
 * @param {string} content
 */
async function writeFileAtomic(targetPath, content) {
  const tempPath = targetPath + ".tmp";
  const bakPath = targetPath + ".bak";

  // 1. Unconditionally clean up any pre-existing stale temp file
  try {
    await fs.unlink(tempPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  // 2. Write new content to the temp file
  try {
    // Ensure parent directory exists (needed if directory structure doesn't exist yet)
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tempPath, content, "utf8");
  } catch (error) {
    // Clean up temp file on failure, ignore if doesn't exist
    try {
      await fs.unlink(tempPath);
    } catch (_) {}
    throw error;
  }

  // 3. Rename temp file to target
  try {
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    // Fallback for Windows rename issue: target exists and throws EEXIST or EPERM
    if (error.code === "EEXIST" || error.code === "EPERM") {
      let backedUp = false;
      try {
        // Try to backup existing target
        await fs.rename(targetPath, bakPath);
        backedUp = true;

        // Try renaming temp to target again
        await fs.rename(tempPath, targetPath);

        // Delete backup on success
        await fs.unlink(bakPath);
      } catch (fallbackError) {
        // Rollback: if backed up, restore original target
        if (backedUp) {
          try {
            await fs.rename(bakPath, targetPath);
          } catch (_) {}
        }
        // Clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch (_) {}
        throw fallbackError;
      }
    } else {
      // Normal error path
      try {
        await fs.unlink(tempPath);
      } catch (_) {}
      throw error;
    }
  }
}

module.exports = {
  writeFileAtomic,
  recoverOrphanBak,
};
