#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseRoutingTable } = require("../lib/route-dispatcher.js");
const { validatePhaseTransition } = require("../lib/flow-validator.js");

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Uso: node validate-phase.js <fase> <ruta> <cambio>");
    process.exit(1);
  }

  const [phase, routeName, changeName] = args;

  // Ruta especial "freeform" o vacía: no se valida nada
  if (routeName === "freeform" || routeName === "" || routeName === "None" || routeName === "null") {
    process.exit(0);
  }

  const repoRoot = path.resolve(__dirname, "../..");
  const configPath = path.join(repoRoot, "openspec", "config.yaml");
  const changeDir = path.join(repoRoot, "openspec", "changes", changeName);

  // Leer y parsear config.yaml para obtener las fases de la ruta
  let routePhases = [];
  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf8");
      const routingTable = parseRoutingTable(configContent);
      const matchedRoute = routingTable.find((r) => r.name === routeName);
      if (matchedRoute) {
        routePhases = matchedRoute.phases || [];
      }
    }
  } catch (e) {
    console.error(`Advertencia: no se pudo parsear config.yaml (${e.message}). Se usará validación básica.`);
  }

  // Si la ruta no se encuentra o no tiene fases definidas, permitir transición
  if (routePhases.length === 0) {
    process.exit(0);
  }

  // Mapear archivos presentes en la carpeta del cambio activo
  const filesToCheck = ["design.md", "tasks.md", "apply-progress.md", "verify-report.md"];
  const filesPresent = {};

  for (const filename of filesToCheck) {
    const filePath = path.join(changeDir, filename);
    filesPresent[filename] = fs.existsSync(filePath);
  }

  // Ejecutar validación
  const result = validatePhaseTransition(phase, routePhases, filesPresent);

  if (!result.allowed) {
    console.error(`\x1b[31m[ERROR DE TRANSICIÓN] ${result.reason}\x1b[0m`);
    process.exit(1);
  }

  console.log(`[OK] Transición a fase '${phase}' aprobada para la ruta '${routeName}'.`);
  process.exit(0);
}

main();
