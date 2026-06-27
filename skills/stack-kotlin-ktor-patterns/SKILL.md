---
name: stack-kotlin-ktor-patterns
description: "Kotlin Ktor web framework — routing, content negotiation, serialization, plugins"
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [kotlin]
---

# Ktor Server Patterns

Comprehensive Ktor patterns for building robust, maintainable HTTP servers with Kotlin coroutines.

## When to Use

- Building Ktor HTTP servers
- Configuring Ktor plugins (Auth, CORS, ContentNegotiation, StatusPages)
- Implementing REST APIs with Ktor
- Setting up dependency injection with Koin
- Writing Ktor integration tests with testApplication
- Working with WebSockets in Ktor

## Core Rules

1. **Clean Route DSL**: Keep route files thin, delegates endpoints using extension functions like `Route.userRoutes()`. Delegate logic to services, not in the route bodies.
2. **Content Negotiation**: Use `kotlinx.serialization` for content negotiation, configuring the JSON parser with explicit settings (`ignoreUnknownKeys = true`, `explicitNulls = false`).
3. **Robust Error Handling**: Handle exceptions centrally using the `StatusPages` plugin, mapping custom domain exceptions (e.g. `NotFoundException`) to appropriate HTTP status codes.
4. **JWT Authentication**: Protect resources by nesting them inside `authenticate("jwt")` blocks. Extract credentials safely using `principal<JWTPrincipal>()`.
5. **Dependency Injection**: Initialize services, repositories, and database connection instances using Koin. Inject dependencies into routes using `by inject()`.

## References

For full code examples, project layout structures, Custom Serializers, WebSockets connections, and BearerAuth integration tests, refer to:
* [Kotlin Ktor Web Framework Patterns & Examples](references/patterns.md)
