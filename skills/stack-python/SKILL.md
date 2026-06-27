---
name: stack-python
description: "Python development guidelines — style, patterns, virtual environments"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [python]
---

# Python Development Patterns

Idiomatic Python patterns and best practices for building robust, efficient, and maintainable applications.

## When to Activate

- Writing new Python code
- Reviewing Python code
- Refactoring existing Python code
- Designing Python packages/modules

## Core Rules

1. **Readability Counts**: Prioritize clarity over cleverness. Write explicit code and use f-strings and type hints.
2. **EAFP Style**: Prefer catching exceptions (`try-except`) rather than checking pre-conditions (`LBYL`), but always target specific exceptions and chain them correctly (`raise ... from e`).
3. **Resource Management**: Use context managers (`with` statement) for managing files, database connections, and locks.
4. **Data Classes**: Use `@dataclass` for data containers, implementing `__post_init__` for field validations.
5. **Memory and Iterators**: Use generators and generator expressions for lazy evaluation of large datasets. Avoid string concatenation inside loops.

## References

For full code examples, detailed structural guides, and tool configurations, refer to:
* [Python Coding Patterns & Examples](references/patterns.md)
