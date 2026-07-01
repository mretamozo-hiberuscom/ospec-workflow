---
name: stack-postgres
description: "PostgreSQL relational database — SQL migrations, indexing strategy, parameterized queries, connection pooling"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [postgres]
---

## Critical Rules

- Never write raw SQL strings with string interpolation; always use parameterized queries to prevent SQL injection.
- Ensure every database schema update is managed via explicit, sequential, version-controlled migration scripts.
- Analyze query execution plans using `EXPLAIN ANALYZE` before creating indexes or writing complex joins.
- Create explicit indexes on foreign keys, highly filtered columns, and join criteria to ensure query performance.
- Limit database connections by configuring a connection pooler like PgBouncer or using client-side connection pooling.
