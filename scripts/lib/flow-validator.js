"use strict";

/**
 * Valida si la transición a una fase objetivo está permitida según las precondiciones de archivos.
 * 
 * @param {string} targetPhase - La fase a iniciar (ej. 'sdd-tasks', 'sdd-apply').
 * @param {string[]} routePhases - Lista de fases declaradas en la ruta activa.
 * @param {object} filesPresent - Objeto mapa de archivos presentes { "design.md": true, "tasks.md": false }.
 * @returns {{ allowed: boolean, reason: string|null }}
 */
function validatePhaseTransition(targetPhase, routePhases, filesPresent) {
  // Si la ruta está vacía o es manual (freeform), no se imponen restricciones
  if (!Array.isArray(routePhases) || routePhases.length === 0) {
    return { allowed: true, reason: null };
  }

  // Verificar que la fase destino esté declarada en la ruta activa
  if (!routePhases.includes(targetPhase)) {
    return {
      allowed: false,
      reason: `La fase '${targetPhase}' no forma parte de las fases de la ruta activa: [${routePhases.join(", ")}].`
    };
  }

  switch (targetPhase) {
    case "sdd-tasks":
      // Si la ruta declara sdd-design antes de sdd-tasks, exige la presencia de design.md
      if (routePhases.includes("sdd-design") && !filesPresent["design.md"]) {
        return {
          allowed: false,
          reason: "Falta el documento de diseño (design.md) requerido por esta ruta antes de crear las tareas."
        };
      }
      break;

    case "sdd-apply":
      // Exige la presencia del plan de tareas (tasks.md)
      if (routePhases.includes("sdd-tasks") && !filesPresent["tasks.md"]) {
        return {
          allowed: false,
          reason: "Falta el plan de tareas (tasks.md) requerido por esta ruta antes de iniciar la implementación (apply)."
        };
      }
      break;

    case "sdd-verify":
      // Exige el registro de progreso (apply-progress.md)
      if (routePhases.includes("sdd-apply") && !filesPresent["apply-progress.md"]) {
        return {
          allowed: false,
          reason: "Falta el registro de progreso (apply-progress.md) requerido antes de proceder a la verificación."
        };
      }
      break;

    case "sdd-archive":
      // Exige el reporte de verificación (verify-report.md)
      if (routePhases.includes("sdd-verify") && !filesPresent["verify-report.md"]) {
        return {
          allowed: false,
          reason: "Falta el reporte de verificación (verify-report.md) aprobado requerido antes de archivar el cambio."
        };
      }
      break;
  }

  return { allowed: true, reason: null };
}

module.exports = {
  validatePhaseTransition
};
