"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertSafeDest } = require("./install-target.js");

test("assertSafeDest: refuses filesystem root", () => {
  const root = path.parse(process.cwd()).root;
  assert.throws(
    () => assertSafeDest(root, process.cwd()),
    /refusing to sync into.*filesystem root/i
  );
});

test("assertSafeDest: refuses home directory", () => {
  const home = os.homedir();
  if (home) {
    assert.throws(
      () => assertSafeDest(home, process.cwd()),
      /refusing to sync into.*home directory/i
    );
  }
});

test("assertSafeDest: refuses exact source repository", () => {
  const source = process.cwd();
  assert.throws(
    () => assertSafeDest(source, source),
    /refusing to sync into.*equals the source repo/i
  );
});

if (process.platform === "win32") {
  test("assertSafeDest: refuses source repository with different drive letter casing on Windows", () => {
    const source = process.cwd();
    const driveLetter = source[0];
    const toggledDrive = driveLetter === driveLetter.toUpperCase() 
      ? driveLetter.toLowerCase() 
      : driveLetter.toUpperCase();
    const toggledSource = toggledDrive + source.slice(1);

    assert.throws(
      () => assertSafeDest(toggledSource, source),
      /refusing to sync into.*equals the source repo/i
    );
  });
}

test("assertSafeDest: refuses descendant directories (nested targets)", () => {
  const source = process.cwd();
  const nestedDest = path.join(source, "dist", "opencode");
  assert.throws(
    () => assertSafeDest(nestedDest, source),
    /refusing to sync into.*inside the source repository/i
  );
});

test("assertSafeDest: refuses ancestor directories that contain the source", () => {
  const source = process.cwd();
  const parent = path.dirname(source);
  // Only test if not root (e.g. users folder containing the dev folder)
  if (parent !== path.parse(parent).root) {
    assert.throws(
      () => assertSafeDest(parent, source),
      /refusing to sync into.*contains the source repository/i
    );
  }
});

test("assertSafeDest: resolves and blocks symlinked source repositories", (t) => {
  const source = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-symlink-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const linkPath = path.join(tempDir, "source-link");
  try {
    fs.symlinkSync(source, linkPath, "junction");
  } catch (e) {
    // Windows developer mode might block symlink creation without admin rights;
    // skip test if link creation fails.
    return;
  }

  assert.throws(
    () => assertSafeDest(linkPath, source),
    /refusing to sync into.*equals the source repo/i
  );
});

test("assertSafeDest: allows safe unrelated directories", () => {
  const tempDir = os.tmpdir();
  const source = process.cwd();
  assertSafeDest(tempDir, source);
});
