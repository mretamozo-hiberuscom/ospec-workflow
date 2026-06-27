---
name: stack-kotlin
description: "Kotlin language guidelines — naming, idioms, coding standards"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [kotlin]
---

# Kotlin Development Patterns

Idiomatic Kotlin patterns and best practices for building robust, efficient, and maintainable applications.

## When to Use

- Writing new Kotlin code
- Reviewing Kotlin code
- Refactoring existing Kotlin code
- Designing Kotlin modules or libraries
- Configuring Gradle Kotlin DSL builds

## Core Rules

1. **Null Safety**: Leverage Kotlin's type system (non-nullable by default). Use safe-call (`?.`) and Elvis (`?:`) operators; never use force-unwarp (`!!`).
2. **Immutability by Default**: Use `val` for variables, immutable collections, and data class `copy()` for transformations.
3. **Sealed Types**: Model restricted hierarchies and results with `sealed class` or `sealed interface` for exhaustive `when` expressions.
4. **Structured Concurrency**: Scope async calls using `coroutineScope` or `supervisorScope`. Respect coroutine cancellation via `ensureActive()`.
5. **DSL Builders**: Implement type-safe builders using `@DslMarker` and lambda receivers.

## References

For full code examples, scope function mappings, DSL implementations, and build configurations, refer to:
* [Kotlin Coding Patterns & Examples](references/patterns.md)
