# Exploration: Detección de Base Compartida Cross-Repo (C4)

## Objective
Investigar los mecanismos del orquestador para detectar y resumir la base compartida (arquitectura, dependencias comunes, patrones de codificación) entre múltiples repositorios miembro del atlas `workspace.yaml`.

## Key Findings & Discoveries

### 1. Ubicación de las Especificaciones Miembro
Las especificaciones miembro residen bajo `{member}/openspec/specs/**/spec.md`. Cada especificación detalla el comportamiento del miembro correspondiente.

### 2. Detección de Componentes Comunes
El orquestador puede escanear y comparar:
- Las dependencias y versiones de paquetes (ej. `package.json` de Node, `go.mod` de Go) de todos los repositorios miembro.
- Configuraciones comunes como linting, testing, Dockerfiles o flujos de CI/CD.
- Interacciones y dependencias directas declaradas en el mapa de contratos (proveedores y consumidores).

### 3. Síntesis en el Coordinador
La base compartida detectada se sintetiza y documenta en un archivo centralizado en el coordinador:
- `docs/architecture/technical-baseline.md` (ampliando la sección de baseline para incluir el baseline general).
- Un nuevo documento específico `docs/architecture/shared-baseline.md` que detalla los estándares de stack, versiones alineadas y políticas compartidas de infraestructura.

## Proposed Strategy
Añadir a `sdd-workspace` la capacidad de analizar e identificar los patrones compartidos recopilados durante el escaneo federado, y generar un informe/baseline unificado que defina el estándar técnico del workspace multirepo.
