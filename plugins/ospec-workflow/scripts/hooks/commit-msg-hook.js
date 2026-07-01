"use strict";

const fs = require("node:fs");

/**
 * Regex that matches any forbidden AI/model attribution in a commit message.
 * Mirrors the pattern from rules/no-model-attribution.instructions.md.
 */
const FORBIDDEN_ATTRIBUTION_RE =
  /co-authored-by|generated (?:with|by)|🤖|claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere/i;

/**
 * Scans a commit message for forbidden AI/model attribution patterns.
 * Returns the matching line or null if the message is clean.
 */
function findAttribution(message) {
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    if (FORBIDDEN_ATTRIBUTION_RE.test(line)) {
      return line.trim();
    }
  }
  return null;
}

function runCommitMsg(msgFilePath) {
  // 1. Bypass por variable de entorno
  if (process.env.DISABLE_OSPEC_ATTRIBUTION_CHECK === "true") {
    process.exit(0);
    return;
  }

  if (!msgFilePath) {
    // Git passes the message file path as the first argument
    msgFilePath = process.argv[2];
  }

  if (!msgFilePath) {
    console.error("OSPEC-COMMIT-MSG: No se recibió la ruta del archivo de mensaje de commit.");
    process.exit(1);
    return;
  }

  let message;
  try {
    message = fs.readFileSync(msgFilePath, "utf8");
  } catch (err) {
    console.warn(`OSPEC-COMMIT-MSG [Warning]: No se pudo leer el archivo de mensaje: ${err.message}`);
    // Ante un error de lectura, dejar pasar para no bloquear innecesariamente
    process.exit(0);
    return;
  }

  const offendingLine = findAttribution(message);
  if (offendingLine) {
    console.error("\n======================================================================");
    console.error("OSPEC-COMMIT-MSG ERROR: Atribución AI/modelo detectada en el mensaje de commit.");
    console.error(`  Línea ofensiva: "${offendingLine}"`);
    console.error("");
    console.error("Regla: Nunca añadir 'Co-Authored-By', nombres de modelo, ni créditos a");
    console.error("herramientas AI en commits. Usa Conventional Commits sin atribución.");
    console.error("");
    console.error("Solución:");
    console.error("  1. Edita el mensaje eliminando las líneas de atribución AI.");
    console.error("  2. Si es un falso positivo legítimo, omite esta verificación con:");
    if (process.platform === "win32") {
      console.error('     $env:DISABLE_OSPEC_ATTRIBUTION_CHECK="true"; git commit ...  (PowerShell)');
      console.error('     o: set DISABLE_OSPEC_ATTRIBUTION_CHECK=true && git commit ... (CMD)');
    } else {
      console.error('     DISABLE_OSPEC_ATTRIBUTION_CHECK=true git commit ...');
    }
    console.error("======================================================================\n");
    process.exit(1);
    return;
  }

  process.exit(0);
}

if (require.main === module) {
  runCommitMsg();
}

module.exports = {
  FORBIDDEN_ATTRIBUTION_RE,
  findAttribution,
  runCommitMsg,
};
