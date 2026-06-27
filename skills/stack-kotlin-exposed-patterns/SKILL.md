---
name: stack-kotlin-exposed-patterns
description: "Kotlin JetBrains Exposed ORM framework — DAO, DSL, transactions"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [kotlin]
---

# Kotlin Exposed Patterns

Comprehensive patterns for database access with JetBrains Exposed ORM, including DSL queries, DAO, transactions, and production-ready configuration.

## When to Use

- Setting up database access with Exposed
- Writing SQL queries using Exposed DSL or DAO
- Configuring connection pooling with HikariCP
- Creating database migrations with Flyway
- Implementing the repository pattern with Exposed
- Handling JSON columns and complex queries

## Core Rules

1. **Exposed Query Styles**: Use DSL for direct SQL-like expressions (explicit control) and DAO for entity lifecycle management.
2. **Transaction Safety**: All database operations must run inside `newSuspendedTransaction` blocks for coroutine safety and atomicity. Explicitly define transaction isolation levels (e.g. `TRANSACTION_READ_COMMITTED`) when required.
3. **Connection Pooling**: Always configure connection pooling via HikariCP, setting `isAutoCommit = false` and validating settings.
4. **Database Migrations**: Manage database schemas with Flyway versioned migrations (`classpath:db/migration`), running them on application startup.
5. **Testing Isolation**: Use an in-memory H2 database (`jdbc:h2:mem:test`) for tests, running them within transactions and deleting all records inside `beforeTest`.

## References

For full code examples, table definitions, join queries, batch operations, JSONB serialization mapping, and testing repositories, refer to:
* [JetBrains Exposed ORM Patterns & Examples](references/patterns.md)
