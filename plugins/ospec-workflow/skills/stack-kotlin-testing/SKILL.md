---
name: stack-kotlin-testing
description: "Kotlin testing standards — Kotest, Mockk, JUnit 5"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [kotlin]
---

# Kotlin Testing Patterns

Comprehensive Kotlin testing patterns for writing reliable, maintainable tests following TDD methodology with Kotest and MockK.

## When to Use

- Writing new Kotlin functions or classes
- Adding test coverage to existing Kotlin code
- Implementing property-based tests or data-driven tests
- Following TDD workflow in Kotlin projects
- Configuring Kover for code coverage
- Testing Ktor HTTP routes

## Core Rules

1. **RED-GREEN-REFACTOR Cycle**: Always write a failing test first, then minimal implementation to pass, then refactor.
2. **Kotest Spec Styles**: Use standard spec styles (`StringSpec` for simple, `FunSpec` for JUnit-like, `BehaviorSpec` for BDD) consistently across files.
3. **MockK Mocking**: Mock interfaces and abstract classes, never data classes. Use `coEvery` / `coVerify` for suspend functions. Clear mocks in `beforeTest`.
4. **Coroutine testing**: Wrap tests in `runTest`. For testing time-based flows, use `StandardTestDispatcher` and advance virtual time with `advanceTimeBy` or `advanceUntilIdle`.
5. **Kover Code Coverage**: Aim for at least 80% coverage on general code and 100% on critical business logic. Exclude generated code and configuration classes from reports.

## References

For full code examples, step-by-step TDD walkthroughs, custom matchers, arg captors, flow testing, property-based setups, and Ktor route testing, refer to:
* [Kotlin Testing Patterns & Examples](references/patterns.md)
