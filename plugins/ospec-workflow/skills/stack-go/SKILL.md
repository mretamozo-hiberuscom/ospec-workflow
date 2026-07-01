---
name: stack-go
description: "Go (Golang) programming language — idiomatic structures, concurrency, error handling"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [go]
---

# Go Development Patterns

Idiomatic Go patterns and best practices for building robust, efficient, and maintainable applications.

## When to Activate

- Writing new Go code
- Reviewing Go code
- Refactoring existing Go code
- Designing Go packages/modules

## Core Rules

1. **Simplicity and Clarity**: Favor simple, clear, and predictable Go code. Handle errors immediately and return early. Keep the happy path unindented.
2. **Make Zero Value Useful**: Design types (especially with mutexes or buffers) so they are usable without explicit initialization.
3. **Accept Interfaces, Return Structs**: Keep interfaces small and define them where they are consumer-needed rather than provider-delivered.
4. **Error Handling**: Wrap errors with context (`fmt.Errorf("...: %w", err)`). Never swallow or ignore errors silently.
5. **Concurrency Safety**: Coordinate goroutines via errgroups or context. Avoid goroutine leaks by listening to `ctx.Done()`.

## References

For full code examples, detailed structural guides, and tool setups, refer to:
* [Go Coding Patterns & Examples](references/patterns.md)
