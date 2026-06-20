---
name: stack-java
description: "Java coding standards for Spring Boot and Quarkus services — naming, immutability, Optional, streams, DI"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [java]
---

## Critical Rules

- Any executor sub-agent using this skill must first determine the framework from the build file (e.g., Maven `pom.xml` or Gradle `build.gradle`):
  - If build file contains `quarkus` -> apply **[QUARKUS]** conventions.
  - If build file contains `spring-boot` -> apply **[SPRING]** conventions.
  - If neither is detected -> apply shared conventions only.
- Prefer clarity over cleverness. Java 17+ features (records, sealed classes, pattern matching) should be used where appropriate.
- Minimize shared mutable state; prefer immutability by default.
- Fail fast with meaningful, domain-specific exceptions.
- **[QUARKUS]**: Favor build-time processing over runtime processing. Avoid runtime reflection where possible.

## Naming & Code Style

- Classes & Records must use `PascalCase` (e.g., `MarketService`, `Money`).
- Methods & fields must use `camelCase` (e.g., `marketRepository`, `findBySlug`).
- Constants must use `UPPER_SNAKE_CASE` (e.g., `MAX_PAGE_SIZE = 100`).
- **[QUARKUS]**: Name JAX-RS resources as `*Resource` (e.g., `MarketResource`), not `*Controller`.
- **[SPRING]**: Name REST controllers as `*Controller` (e.g., `MarketController`).

## Immutability

- Favor records and final fields for data transfer objects (DTOs) and value objects:
  ```java
  public record MarketDto(Long id, String name, MarketStatus status) {}
  ```
- **[QUARKUS]**: Panache active-record entities use public fields (as idiomatic Quarkus behavior since Quarkus generates accessors at build time):
  ```java
  @Entity
  public class Market extends PanacheEntity {
      public String name;
      public MarketStatus status;
  }
  ```

## Optional & Streams Best Practices

- Return `Optional` from `find*` query methods instead of returning null or throwing immediate exceptions.
- Prefer mapping and chaining operations over calling `.get()` directly:
  ```java
  return market
      .map(MarketResponse::from)
      .orElseThrow(() -> new EntityNotFoundException("Market not found"));
  ```
- Keep Stream pipelines short and readable. Use them primarily for clean transformations. Do not use complex nested streams; prefer structured loops for readability when logic is complex.

## Dependency Injection

- **[SPRING]**: Use constructor injection for dependencies; avoid field-level `@Autowired` injection:
  ```java
  @Service
  public class MarketService {
      private final MarketRepository marketRepository;

      public MarketService(MarketRepository marketRepository) {
          this.marketRepository = marketRepository;
      }
  }
  ```
- **[QUARKUS]**: Use constructor injection with `@Inject`:
  ```java
  @ApplicationScoped
  public class MarketService {
      private final MarketRepository marketRepository;

      @Inject
      public MarketService(MarketRepository marketRepository) {
          this.marketRepository = marketRepository;
      }
  }
  ```
