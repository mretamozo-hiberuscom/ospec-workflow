---
name: stack-kafka
description: "Apache Kafka messaging — idempotence, error handling, manual offset committing, schema registry, partition ordering"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [kafka]
---

## Critical Rules

- **Idempotence**: Always enable producer idempotence (`enable.idempotence=true`) to guarantee exactly-once delivery semantics per partition and prevent duplicate messages.
- **Manual Offset Commit**: Disable auto-committing offsets (`enable.auto.commit=false`) in consumers. Commit offsets manually only after the message has been successfully processed.
- **DLQ and Error Handling**: Implement structured retry policies. When a message fails validation or processing repeatedly, route it to a Dead Letter Queue (DLQ) topic to avoid blocking the partition.
- **Schema Contracts**: Define schemas using Avro or JSON Schema and register them with a central Schema Registry to enforce backwards/forward compatibility contract rules.
- **Partition Ordering**: Ensure message keys are defined appropriately. Messages with the same key are guaranteed to be routed to the same partition and processed in order.

## Producer Guidelines

1. **Idempotence**: Ensuring `enable.idempotence=true` automatically configures `acks=all`, retries to maximum, and max in-flight requests per connection to $\le 5$, avoiding message duplication and reordering.
2. **Partition Keys**: Assign explicit, meaningful keys (e.g., `order_id`, `customer_id`) rather than leaving them null. A null key will round-robin messages, breaking sequential message ordering requirements.
3. **Schema Registry**: Ensure schema serialization uses Registry-aware serializers (e.g., `KafkaAvroSerializer`). Never send raw strings or arbitrary JSON unless explicitly designed.

## Consumer Guidelines

1. **Manual Commit**: Commit offsets after processing (e.g., `commitSync()` or `commitAsync()`) to avoid losing messages due to application crashes during auto-commits.
2. **Error Handling & DLQ**:
   - Parse or deserialize exceptions should route to an invalid-payload DLQ immediately.
   - Transient operational errors should trigger a backoff retry mechanism (e.g., Spring Kafka container-level retries or custom retry topics).
   - Poison pill messages must be forwarded to the DLQ after a maximum number of failed attempts to keep the consumer group moving.
