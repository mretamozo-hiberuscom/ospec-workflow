---
name: stack-vite
description: "Vite frontend build tool — configuration, plugins, asset loading"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [vite]
---

# Vite Patterns

Build tool and dev server patterns for Vite 8+ projects. Covers configuration, environment variables, proxy setup, library mode, dependency pre-bundling, and common production pitfalls.

## When to Use

- Configuring `vite.config.ts` or `vite.config.js`
- Setting up environment variables or `.env` files
- Configuring dev server proxy for API backends
- Optimizing build output (chunks, minification, assets)
- Publishing libraries with `build.lib`
- Troubleshooting dependency pre-bundling or CJS/ESM interop

## Core Rules

1. **Dev vs Build Engines**: Dev serves files as native ESM (transpiled on demand via esbuild). Production builds use Rolldown/Rollup. Always smoke-test with `vite preview` before deploying.
2. **Type Checking Gap**: Vite build transpiles but does NOT type-check. You must run `tsc --noEmit` in CI or use `vite-plugin-checker`.
3. **Environment Security**: Only `VITE_`-prefixed environment variables are exposed to the client. Secrets must NEVER use the prefix. Never pass empty string `loadEnv(mode, cwd, '')` as it leaks server secrets.
4. **Performance Aliases**: Avoid hand-rolling aliases. Use `vite-tsconfig-paths` to reuse `tsconfig.json` configurations.
5. **Barrel Files**: Avoid importing from index/barrel files in the dev server hot-path as it triggers loading of all re-exported files.

## References

For full code examples, plugin configurations, manual chunk setups, and server proxy details, refer to:
* [Vite Configuration & Build Optimization Patterns](references/patterns.md)
