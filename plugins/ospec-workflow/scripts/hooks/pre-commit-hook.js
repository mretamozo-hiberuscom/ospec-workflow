"use strict";

const child_process = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runPreCommit() {
  // 1. Bypass por variable de entorno
  if (process.env.DISABLE_OSPEC_PRECOMMIT === "true") {
    console.log("OSPEC-PRECOMMIT: Bypass activo via env var. Omitiendo validación.");
    process.exit(0);
    return;
  }

  const repoRoot = path.resolve(__dirname, "../..");

  // 2. Ejecutar validación de OpenSpec
  try {
    // Task 2.1: progress feedback while output is buffered
    console.log("OSPEC-PRECOMMIT: Ejecutando validación de OpenSpec...");

    // Task 2.2: capture stdout/stderr via pipe instead of inheriting
    const checkResult = child_process.spawnSync("node", ["scripts/check.js"], {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
    });

    if (checkResult.error) {
      throw checkResult.error;
    }

    if (checkResult.status !== 0) {
      // Task 2.4a: emit captured stdout verbatim
      if (checkResult.stdout) process.stdout.write(checkResult.stdout);
      // Task 2.4b: emit captured stderr verbatim
      if (checkResult.stderr) process.stderr.write(checkResult.stderr);
      // Task 2.4c: === banner naming the failure origin and bypass options
      console.error("\n======================================================================");
      console.error("OSPEC-PRECOMMIT ERROR: La validación de OpenSpec falló. El commit fue rechazado.");
      console.error("  Origen del fallo: scripts/check.js");
      console.error("");
      console.error("Para omitir esta verificación (emergencias):");
      if (process.platform === "win32") {
        console.error('  $env:DISABLE_OSPEC_PRECOMMIT="true"; git commit ...  (PowerShell)');
        console.error('  o: set DISABLE_OSPEC_PRECOMMIT=true && git commit ... (CMD)');
      } else {
        console.error('  DISABLE_OSPEC_PRECOMMIT=true git commit ...');
      }
      console.error("  o: git commit --no-verify");
      console.error("======================================================================\n");
      process.exit(1);
      return;
    }

    // Task 2.3: success path — brief one-liner, captured output suppressed
    console.log("OSPEC-PRECOMMIT: Validación completada. Commit permitido.");
  } catch (err) {
    // Opción 4: B - En fallos de entorno u otros errores externos, emitir warning pero continuar.
    console.warn(`\nOSPEC-PRECOMMIT [Warning]: No se pudo ejecutar el validador check.js por una falla externa: ${err.message}. Continuando validación...`);
  }

  // 3. Verificación de Strict TDD
  let strictTdd = false;
  try {
    const configPath = path.join(repoRoot, "openspec", "config.yaml");
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf8");
      // Buscar strict_tdd: true
      if (/strict_tdd\s*:\s*true/i.test(configContent)) {
        strictTdd = true;
      }
    }
  } catch (err) {
    // Ignorar errores al leer configuración, por defecto false
  }

  if (strictTdd) {
    try {
      const diffResult = child_process.spawnSync("git", ["diff", "--cached", "--name-only"], {
        cwd: repoRoot,
        encoding: "utf8",
      });

      if (diffResult.error || diffResult.status !== 0) {
        console.warn("OSPEC-PRECOMMIT [Warning]: No se pudo obtener la lista de archivos staged de Git.");
        process.exit(0);
        return;
      }

      const stagedFiles = diffResult.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      const prodFiles = [];
      let hasTestFile = false;
      let hasTasksFile = false;

      for (const file of stagedFiles) {
        const lower = file.toLowerCase();
        const base = path.basename(file).toLowerCase();
        const ext = path.extname(file).toLowerCase();

        // Identificar si es test o tasks.md
        if (base.endsWith("_test.go") || base.endsWith(".test.js")) {
          hasTestFile = true;
          continue;
        }

        if (base === "tasks.md") {
          hasTasksFile = true;
          continue;
        }

        // Identificar si es código de producción (Go o JS)
        const isGoProd = ext === ".go";
        const isJsProd = ext === ".js";

        // Excluir archivos que no sean producción (configuraciones, scripts de setup, etc.)
        const isProdPath =
          file.startsWith("internal/") ||
          file.startsWith("cmd/") ||
          file.startsWith("scripts/hooks/") ||
          file.startsWith("scripts/lib/");

        if ((isGoProd || isJsProd) && isProdPath) {
          prodFiles.push(file);
        }
      }

      // Si hay archivos de producción staged pero no hay tests ni tasks.md
      if (prodFiles.length > 0 && !hasTestFile && !hasTasksFile) {
        console.error("\n======================================================================");
        console.error("OSPEC-PRECOMMIT ERROR: Violación del ciclo de Strict TDD.");
        console.error("Se detectaron cambios de producción staged sin archivos de prueba correspondientes.");
        console.error("Archivos de producción afectados:");
        prodFiles.forEach(file => console.error(`  - ${file}`));
        console.error("\nSolución:");
        console.error("  1. Agrega y prepara para commit (*_test.go o *.test.js) con las pruebas de estos cambios.");
        console.error("  2. O prepara el archivo de tareas (tasks.md) si estás en etapa de planificación.");
        console.error("  3. Si es un commit de emergencia, puedes omitir la verificación usando 'git commit --no-verify'.");
        console.error("======================================================================\n");
        process.exit(1);
        return;
      }
    } catch (err) {
      console.warn(`OSPEC-PRECOMMIT [Warning]: Error durante la verificación de Strict TDD: ${err.message}`);
    }
  }

  process.exit(0);
  return;
}

if (require.main === module) {
  runPreCommit();
}

module.exports = {
  runPreCommit,
};
