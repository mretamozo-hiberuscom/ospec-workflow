# Kotlin Testing Patterns

Comprehensive Kotlin testing patterns for writing reliable, maintainable tests following TDD methodology with Kotest and MockK.

## TDD Workflow for Kotlin

### The RED-GREEN-REFACTOR Cycle

```
RED     -> Write a failing test first
GREEN   -> Write minimal code to pass the test
REFACTOR -> Improve code while keeping tests green
REPEAT  -> Continue with next requirement
```

### Step-by-Step TDD in Kotlin

```kotlin
// Step 1: Define the interface/signature
// EmailValidator.kt
package com.example.validator

fun validateEmail(email: String): Result<String> {
    TODO("not implemented")
}

// Step 2: Write failing test (RED)
// EmailValidatorTest.kt
package com.example.validator

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.result.shouldBeFailure
import io.kotest.matchers.result.shouldBeSuccess

class EmailValidatorTest : StringSpec({
    "valid email returns success" {
        validateEmail("user@example.com").shouldBeSuccess("user@example.com")
    }

    "empty email returns failure" {
        validateEmail("").shouldBeFailure()
    }

    "email without @ returns failure" {
        validateEmail("userexample.com").shouldBeFailure()
    }
})

// Step 3: Run tests - verify FAIL
// $ ./gradlew test
// EmailValidatorTest > valid email returns success FAILED
//   kotlin.NotImplementedError: An operation is not implemented

// Step 4: Implement minimal code (GREEN)
fun validateEmail(email: String): Result<String> {
    if (email.isBlank()) return Result.failure(IllegalArgumentException("Email cannot be blank"))
    if ('@' !in email) return Result.failure(IllegalArgumentException("Email must contain @"))
    val regex = Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
    if (!regex.matches(email)) return Result.failure(IllegalArgumentException("Invalid email format"))
    return Result.success(email)
}

// Step 5: Run tests - verify PASS
```

## Kotest Spec Styles

### StringSpec (Simplest)

```kotlin
class CalculatorTest : StringSpec({
    "add two positive numbers" {
        Calculator.add(2, 3) shouldBe 5
    }

    "add negative numbers" {
        Calculator.add(-1, -2) shouldBe -3
    }
})
```

### FunSpec (JUnit-like)

```kotlin
class UserServiceTest : FunSpec({
    val repository = mockk<UserRepository>()
    val service = UserService(repository)

    test("getUser returns user when found") {
        val expected = User(id = "1", name = "Alice")
        coEvery { repository.findById("1") } returns expected

        val result = service.getUser("1")

        result shouldBe expected
    }

    test("getUser throws when not found") {
        coEvery { repository.findById("999") } returns null

        shouldThrow<UserNotFoundException> {
            service.getUser("999")
        }
    }
})
```

### BehaviorSpec (BDD Style)

```kotlin
class OrderServiceTest : BehaviorSpec({
    val repository = mockk<OrderRepository>()
    val paymentService = mockk<PaymentService>()
    val service = OrderService(repository, paymentService)

    Given("a valid order request") {
        val request = CreateOrderRequest(
            userId = "user-1",
            items = listOf(OrderItem("product-1", quantity = 2)),
        )

        When("the order is placed") {
            coEvery { paymentService.charge(any()) } returns PaymentResult.Success
            coEvery { repository.save(any()) } answers { firstArg() }

            val result = service.placeOrder(request)

            Then("it should return a confirmed order") {
                result.status shouldBe OrderStatus.CONFIRMED
            }

            Then("it should charge payment") {
                coVerify(exactly = 1) { paymentService.charge(any()) }
            }
        }
    }
})
```

### DescribeSpec (RSpec Style)

```kotlin
class UserValidatorTest : DescribeSpec({
    describe("validateUser") {
        val validator = UserValidator()

        context("with valid input") {
            it("accepts a normal user") {
                val user = CreateUserRequest("Alice", "alice@example.com")
                validator.validate(user).shouldBeValid()
            }
        }
    }
})
```

## Kotest Matchers

### Core Matchers

```kotlin
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.string.*
import io.kotest.matchers.collections.*
import io.kotest.matchers.nulls.*

// Equality
result shouldBe expected
result shouldNotBe unexpected

// Strings
name shouldStartWith "Al"
name shouldEndWith "ice"
name shouldContain "lic"

// Collections
list shouldContain "item"
list shouldHaveSize 3
list.shouldBeSorted()

// Nulls
result.shouldNotBeNull()
result.shouldBeNull()
```

### Custom Matchers

```kotlin
fun beActiveUser() = object : Matcher<User> {
    override fun test(value: User) = MatcherResult(
        value.isActive && value.lastLogin != null,
        { "User ${value.id} should be active with a last login" },
        { "User ${value.id} should not be active" },
    )
}

user should beActiveUser()
```

## MockK

### Basic Mocking

```kotlin
class UserServiceTest : FunSpec({
    val repository = mockk<UserRepository>()
    val logger = mockk<Logger>(relaxed = true)
    val service = UserService(repository, logger)

    beforeTest {
        clearMocks(repository, logger)
    }

    test("findUser delegates to repository") {
        val expected = User(id = "1", name = "Alice")
        every { repository.findById("1") } returns expected

        val result = service.findUser("1")

        result shouldBe expected
        verify(exactly = 1) { repository.findById("1") }
    }
})
```

### Coroutine Mocking

```kotlin
class AsyncUserServiceTest : FunSpec({
    val repository = mockk<UserRepository>()
    val service = UserService(repository)

    test("getUser suspending function") {
        coEvery { repository.findById("1") } returns User(id = "1", name = "Alice")

        val result = service.getUser("1")

        result.name shouldBe "Alice"
        coVerify { repository.findById("1") }
    }
})
```

### Argument Capture

```kotlin
test("save captures the user argument") {
    val slot = slot<User>()
    coEvery { repository.save(capture(slot)) } returns Unit

    service.createUser(CreateUserRequest("Alice", "alice@example.com"))

    slot.captured.name shouldBe "Alice"
    slot.captured.email shouldBe "alice@example.com"
}
```

### Spy and Partial Mocking

```kotlin
test("spy on real object") {
    val realService = UserService(repository)
    val spy = spyk(realService)

    every { spy.generateId() } returns "fixed-id"

    spy.createUser(request)

    verify { spy.generateId() }
}
```

## Coroutine Testing

### runTest for Suspend Functions

```kotlin
import kotlinx.coroutines.test.runTest

class CoroutineServiceTest : FunSpec({
    test("concurrent fetches complete together") {
        runTest {
            val service = DataService(testScope = this)
            val result = service.fetchAllData()
            result.users.shouldNotBeEmpty()
        }
    }
})
```

### Testing Flows

```kotlin
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest

class FlowServiceTest : FunSpec({
    test("observeUsers emits updates") {
        runTest {
            val service = UserFlowService()
            val emissions = service.observeUsers().take(3).toList()
            emissions shouldHaveSize 3
        }
    }
})
```

## Property-Based Testing

```kotlin
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.forAll

class PropertyTest : FunSpec({
    test("string reverse is involutory") {
        forAll<String> { s ->
            s.reversed().reversed() == s
        }
    }
})
```

## Data-Driven Testing

```kotlin
class ParserTest : FunSpec({
    context("parsing valid dates") {
        withData(
            "2026-01-15" to LocalDate(2026, 1, 15),
            "2026-12-31" to LocalDate(2026, 12, 31),
        ) { (input, expected) ->
            parseDate(input) shouldBe expected
        }
    }
})
```

## Kover Coverage

### Gradle Configuration

```kotlin
// build.gradle.kts
plugins {
    id("org.jetbrains.kotlinx.kover") version "0.9.7"
}

kover {
    reports {
        total {
            html { onCheck = true }
            xml { onCheck = true }
        }
        verify {
            rule {
                minBound(80) // Fail build below 80% coverage
            }
        }
    }
}
```

## Ktor testApplication Testing

```kotlin
class ApiRoutesTest : FunSpec({
    test("GET /users returns list") {
        testApplication {
            application {
                configureRouting()
                configureSerialization()
            }

            val response = client.get("/users")
            response.status shouldBe HttpStatusCode.OK
        }
    }
})
```
