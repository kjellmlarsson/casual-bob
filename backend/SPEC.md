# Spec: `backend` component

Part of [casual-bob](../SPEC.md). That overview defines the interfaces between the three components.
This document defines the `backend` component: the Quarkus REST application, the Casual outbound
connection, error mapping, health checks, and the container image.

Status: implemented. `./gradlew test` passes (10 tests, run on 2026-11-11). The manifests are in
`deploy/base/backend/`. The acceptance results for the image and the live calls (section 7, criteria
2 to 6) are not recorded here.

## 1. Purpose

Run a Quarkus backend application (Java 25) that receives HTTP REST requests from the frontend or direct
clients, calls the `catfacts/random` Casual service over Casual network protocol via `casual-quarkus`
(JCA / IronJacamar), and returns the upper-cased fact or error as JSON.

## 2. Interface

| | |
|---|---|
| Listens on | HTTP `8080`, all interfaces |
| REST endpoint | `GET /api/fact` |
| Reply on success | `200 OK`, `Content-Type: application/json`<br/>Body: `{"fact":"<text>"}` |
| Reply on service error / unreachable | `502 Bad Gateway`, `Content-Type: application/json`<br/>Body: `{"error":"<message>"}` |
| Reply on timeout | `504 Gateway Timeout`, `Content-Type: application/json`<br/>Body: `{"error":"<message>"}` |
| Health / Liveness | `GET /q/health/live` → `200 OK` `{"status":"UP",...}` |
| Health / Readiness | `GET /q/health/ready` → `200 OK` `{"status":"UP",...}` |
| Outbound target | Casual service `catfacts/random` via Casual network protocol (TCP) at `${CASUAL_HOST:casual}:${CASUAL_PORT:7771}` |
| Outbound request buffer | `X_OCTET` (empty payload) |
| Outbound reply buffer | `X_OCTET` UTF-8 bytes containing upper-cased fact text |

## 3. Files

| File | Purpose |
|---|---|
| `build.gradle`, `settings.gradle`, `gradle.properties`, `gradlew`, `gradle/` | Gradle build using Java 25 toolchain and Quarkus plugin |
| `src/main/java/se/bob/FactResource.java` | REST resource handling `GET /api/fact` |
| `src/main/java/se/bob/FactService.java` | Outbound Casual caller (`tpcall` of `catfacts/random`) |
| `src/main/java/se/bob/FactResponse.java` | DTO record for `{"fact":"<text>"}` |
| `src/main/java/se/bob/ErrorResponse.java` | DTO record for `{"error":"<message>"}` |
| `src/main/java/se/bob/CasualTimeoutException.java`, `CasualGatewayException.java` | The two exceptions `FactService` throws, for 504 and 502 |
| `src/main/java/se/bob/CasualExceptionMapper.java` | Exception mapper translating the exceptions to JSON responses (504, 502, otherwise 500) |
| `src/main/resources/application.properties` | Quarkus configuration (IronJacamar RA pool, virtual threads, logging) |
| `src/test/java/se/bob/FactResourceTest.java` | `@QuarkusTest` REST endpoint and health tests, with `FactService` mocked |
| `src/test/java/se/bob/FactServiceTest.java` | Unit tests of `FactService` with a mocked `CasualConnectionFactory` |
| `Containerfile` | Multi-stage image build (Gradle build stage, then UBI OpenJDK 25 runtime stage) |
| `README.md`, `AGENTS.md` | Notes for working in this component |

## 4. Architecture & Behaviour

### 4.1 Casual Outbound Client

- Outbound calls only; no `@CasualService` inbound listeners needed.
- Uses `CasualConnectionFactory` injected with `@Identifier("casual")`.
- `CasualConnection` is obtained from the factory and closed in a `try-with-resources` block on every call.
- Uses `OctetBuffer.of(new byte[0])` for the request buffer to `catfacts/random`.
- Calls `connection.tpcall("catfacts/random", buffer, Flag.of(AtmiFlags.NOFLAG))`.
- On `ErrorState.OK` and a service return state other than `TPFAIL`: extracts the UTF-8 string from the
  `X_OCTET` reply buffer and returns a `FactResponse`.

### 4.2 Error Handling & HTTP Status Mapping

Casual error states and connection exceptions are mapped to HTTP status codes with JSON body `{"error":"<message>"}`:

| Cause / Error Condition | Casual Error / Exception | HTTP Status | Response Body |
|---|---|---|---|
| Timeout calling Casual service | `ErrorState.TPETIME` | `504 Gateway Timeout` | `{"error":"Casual service timed out"}` |
| Any other Casual error state | Error state other than `OK` and `TPETIME` | `502 Bad Gateway` | `{"error":"Casual service failed with error state: <state>"}` |
| Service replied `TPFAIL` | Service return state `TPFAIL` | `502 Bad Gateway` | `{"error":"Casual service returned TPFAIL"}` |
| Casual connection refused / pool unavailable | Any other exception from the connection factory or the call | `502 Bad Gateway` | `{"error":"Unable to connect to Casual: <details>"}` |
| No reply, missing reply buffer or empty bytes | Reply, buffer or bytes missing or empty | `502 Bad Gateway` | `{"error":"No reply received from Casual service"}` or `{"error":"Empty reply received from Casual"}` |
| Anything else | Any other exception | `500 Internal Server Error` | `{"error":"<message>"}`, or `Internal server error` if there is no message |

Every exception that reaches the mapper is logged at `ERROR`.

### 4.3 Configuration & Environment Overrides

The application supports these environment variables for OpenShift and local container runs. The HTTP
port is fixed at `8080` in `application.properties`.

| Property | Environment Variable | Default | Purpose |
|---|---|---|---|
| `quarkus.ironjacamar.casual.ra.config.host` | `CASUAL_HOST` | `casual` | Casual gateway host |
| `quarkus.ironjacamar.casual.ra.config.port` | `CASUAL_PORT` | `7771` | Casual gateway port |
| - | `CASUAL_UNMANAGED` | unset (set to `true` in the OpenShift ConfigMap) | Casual outbound uses its own thread pool instead of a JNDI managed executor, which Quarkus does not have. Not referenced by this application's own code. |

Fixed in `application.properties`: outbound pool size `1`, pool name `casual-pool`, inbound server port
`7772`, virtual threads enabled.

## 5. Container Image: `Containerfile`

Multi-stage build using Java 25:
1. **Build stage**: `registry.access.redhat.com/ubi9/openjdk-25:1.24`. The Gradle distribution is resolved
   in its own layer, then `./gradlew build -x test` builds the Quarkus fast-jar.
2. **Runtime stage**: `registry.access.redhat.com/ubi9/openjdk-25-runtime:1.24`.
   - Runs as user `185`, with group 0 ownership of the files (compatible with OpenShift arbitrary UID).
   - Exposes port 8080.
   - Entrypoint is the image's `run-java.sh`, which starts `/deployments/quarkus-run.jar`.

## 6. Unit & Integration Tests

1. `FactResourceTest` (`FactService` mocked):
   - `test_getFact_success__returns_200_and_json`: Mocked service returns a fact $\rightarrow$ HTTP 200 `{"fact":"CATS SLEEP A LOT"}`.
   - `test_getFact_serviceError__returns_502`: Mocked service throws `CasualGatewayException` $\rightarrow$ HTTP 502 `{"error":"..."}`.
   - `test_getFact_timeout__returns_504`: Mocked service throws `CasualTimeoutException` $\rightarrow$ HTTP 504 `{"error":"..."}`.
   - `test_health_live__returns_200`: Liveness check returns UP.
   - `test_health_ready__returns_200`: Readiness check returns UP.
2. `FactServiceTest` (`CasualConnectionFactory` mocked):
   - `test_getFact_success`
   - `test_getFact_timeout_throwsCasualTimeoutException`
   - `test_getFact_errorState_throwsCasualGatewayException`
   - `test_getFact_connectionFailure_throwsCasualGatewayException`
   - `test_getFact_emptyReply_throwsCasualGatewayException`

## 7. Acceptance Criteria

| # | Check | Expected |
|---|---|---|
| 1 | Build backend jar and run unit tests | `./gradlew test` passes with all tests green |
| 2 | Build container image | `podman build -t localhost/casual-bob-backend:dev backend/` exits 0 |
| 3 | Start backend container with mock or live `casual` container | `GET /q/health/live` and `GET /q/health/ready` return 200 |
| 4 | `GET /api/fact` with healthy `casual` container running `catfacts/random` | Returns HTTP 200 with JSON `{"fact":"<TEXT>"}` where text is non-empty and upper-cased |
| 5 | `GET /api/fact` when `casual` container is stopped | Returns HTTP 502 with JSON `{"error":"..."}` within 2 seconds (no hang) |
| 6 | Container running as random UID (e.g. `1000690000`) with read-only root fs (tmpfs at `/tmp`) | Boots and responds successfully |

## 8. Out of Scope

Inbound Casual services in backend, transactions/XA, database/persistence, user authentication, and response caching.
