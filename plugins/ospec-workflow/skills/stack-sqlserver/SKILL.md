---
name: stack-sqlserver
description: "Microsoft SQL Server database — indexing, RCSI, set-based operations, SARGable queries, transaction scopes"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [sqlserver]
---

## Critical Rules

- **Index Design**: Clustered index keys should be sequential/monotonically increasing (e.g., identity columns, `NEWSEQUENTIALID()`) to minimize page splits. For non-clustered indexes, use the `INCLUDE` clause to cover queries instead of adding columns to the index key.
- **Concurrency (RCSI)**: Enable Read Committed Snapshot Isolation (RCSI) on the database level to prevent readers from blocking writers and writers from blocking readers.
- **Avoid Cursors**: Perform set-based operations rather than row-by-row operations (cursors, `WHILE` loops with index iteration) to optimize execution engine performance.
- **SARGable Queries**: Write Search Argumentable (SARGable) queries. Do not apply functions or calculations to indexed columns in the `WHERE` or `ON` clauses.
- **Transaction Scope**: Keep transactions as short and narrow as possible to minimize locking, page contention, and deadlocks.

## Indexing & Storage Best Practices

1. **Clustered Indexes**: Every table must have a clustered index. Prefer a narrow, static, sequential key. Avoid random GUIDs (`NEWID()`) as clustered keys as they cause heavy index fragmentation.
2. **Covering Indexes**: If a query selects specific columns, create a non-clustered index where the filter criteria columns form the index keys, and other selected columns are added using the `INCLUDE` clause:
   ```sql
   CREATE NONCLUSTERED INDEX IX_Orders_CustomerId_Status
   ON Orders (CustomerId, Status)
   INCLUDE (OrderDate, TotalAmount);
   ```

## Query Design & SARGability

1. **SARGable WHERE Clauses**:
   - **Bad**: `WHERE DATEADD(day, 7, OrderDate) >= GETDATE()` (Non-SARGable, index scan)
   - **Good**: `WHERE OrderDate >= DATEADD(day, -7, GETDATE())` (SARGable, index seek)
2. **Set-Based Operations**: Use joins, subqueries, and window functions (`ROW_NUMBER()`, `RANK()`) to manipulate datasets at once. Avoid iterating through table rows manually.

## Concurrency & RCSI

1. **RCSI Enablement**: Ensure RCSI is enabled:
   ```sql
   ALTER DATABASE YourDatabase SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
   ```
2. **Isolation Levels**: Rely on the default Read Committed isolation level (which uses row versioning under RCSI) instead of abusing dirty reads (`NOLOCK` table hints) or overly restrictive isolation levels (`SERIALIZABLE`).
3. **Short Transactions**: Execute non-database operations (HTTP requests, file I/O, slow calculations) outside of database transaction blocks.
