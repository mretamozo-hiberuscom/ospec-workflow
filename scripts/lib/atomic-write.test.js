"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

// Load the module that does not exist or has no implementation yet
const { writeFileAtomic, recoverOrphanBak } = require("./atomic-write.js");

async function createTempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "atomic-write-test-"));
}

test("1.1.1 · Normal write — temp file created then renamed", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const content = "members:\n  - id: member-1";

    await writeFileAtomic(targetPath, content);

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, content);

    // Verify no temp file left behind
    const tempPath = targetPath + ".tmp";
    await assert.rejects(fs.stat(tempPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.2 · Stale .tmp file overwritten unconditionally", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const tempPath = targetPath + ".tmp";

    // Write stale tmp file
    await fs.writeFile(tempPath, "stale content");

    const content = "new atomic content";
    await writeFileAtomic(targetPath, content);

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, content);

    // Temp file should be gone
    await assert.rejects(fs.stat(tempPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.3 · Write failure of temp — original preserved, tmp cleaned up", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const originalContent = "original content";
    await fs.writeFile(targetPath, originalContent);

    // Create a file at the place of the parent directory of badTargetPath
    const fileAsDir = path.join(tmpDir, "somefile");
    await fs.writeFile(fileAsDir, "not a directory");
    const badTargetPath = path.join(fileAsDir, "workspace.yaml");

    await assert.rejects(writeFileAtomic(badTargetPath, "new content"));

    // Original target should be untouched
    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, originalContent);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.4 · Windows rename fallback — target.bak created, tmp renamed, .bak deleted", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const originalContent = "original content";
    await fs.writeFile(targetPath, originalContent);

    // We want to force the Windows rename fallback.
    // The fallback is triggered when fs.rename throws EEXIST or EPERM.
    // Let's override fs.rename to simulate this once.
    const originalRename = fs.rename;
    let renameCallCount = 0;
    let renameSpy = [];

    fs.rename = async (oldPath, newPath) => {
      renameCallCount++;
      renameSpy.push({ oldPath, newPath });
      if (newPath === targetPath && oldPath === targetPath + ".tmp" && renameCallCount === 1) {
        // Throw EEXIST to simulate Windows rename collision
        const err = new Error("EEXIST: file already exists, rename");
        err.code = "EEXIST";
        throw err;
      }
      return originalRename(oldPath, newPath);
    };

    try {
      const content = "new windows content";
      await writeFileAtomic(targetPath, content);

      const actual = await fs.readFile(targetPath, "utf8");
      assert.strictEqual(actual, content);

      // Verify the spy showed the fallback calls:
      // 1. rename(targetPath + '.tmp', targetPath) -> fails EEXIST
      // 2. rename(targetPath, targetPath + '.bak') -> success
      // 3. rename(targetPath + '.tmp', targetPath) -> success
      assert.ok(renameCallCount >= 3);
      
      // Verify no .bak left
      await assert.rejects(fs.stat(targetPath + ".bak"), { code: "ENOENT" });
      await assert.rejects(fs.stat(targetPath + ".tmp"), { code: "ENOENT" });
    } finally {
      fs.rename = originalRename;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.5 · Orphaned .bak recovery when target is absent", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const bakPath = targetPath + ".bak";
    const bakContent = "orphaned bak content";
    await fs.writeFile(bakPath, bakContent);

    // Prior to writing, recoverOrphanBak should restore it
    await recoverOrphanBak(targetPath);

    const targetActual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(targetActual, bakContent);
    await assert.rejects(fs.stat(bakPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.6 · Crash post-tmp before rename — stale .tmp overwritten in re-run", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const tempPath = targetPath + ".tmp";

    await fs.writeFile(tempPath, "half written content");

    // Re-run
    await writeFileAtomic(targetPath, "full content");

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, "full content");
    await assert.rejects(fs.stat(tempPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.7 · writeFileAtomic on federation-baseline-status.yaml", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "federation-baseline-status.yaml");
    const content = "status: pending";

    await writeFileAtomic(targetPath, content);

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, content);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
