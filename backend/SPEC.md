# Spec: `backend` component

Part of [casual-bob](../SPEC.md). That overview defines the interfaces between the three components.
This document defines the `backend` component: the Quarkus REST application, the Casual outbound
connection, error mapping, health checks, and the container image.

Status: draft.

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
| `build.gradle`, `settings.gradle`, `gradlew`, `gradle/` | Gradle build using Java 25 toolchain and Quarkus plugin |
| `src/main/java/se/bob/FactResource.java` | REST resource handling `GET /api/fact` |
| `src/main/java/se/bob/FactService.java` | Outbound Casual caller interface & implementation |
| `src/main/java/se/bob/FactResponse.java` | DTO record for `{"fact":"<text>"}` |
| `src/main/java/se/bob/ErrorResponse.java` | DTO record for `{"error":"<message>"}` |
| `src/main/java/se/bob/CasualExceptionMapper.java` | Exception mappers translating Casual errors to 502 / 504 JSON responses |
| `src/main/resources/application.properties` | Quarkus configuration (IronJacamar RA pool, virtual threads, logging) |
| `src/main/resources/casual-config.json` | Casual unmanaged outbound domain configuration |
| `src/test/java/se/bob/FactResourceTest.java` | Quarkus unit and REST endpoint tests (mocked Casual backend) |
| `Containerfile` | Multi-stage image build (Gradle build stage -> UBI/Temurin Java 25 runtime stage) |

## 4. Architecture & Behaviour

### 4.1 Casual Outbound Client

- Outbound calls only; no `@CasualService` inbound listeners needed.
- Uses `CasualConnectionFactory` injected with `@Identifier("casual")`.
- `CasualConnection` is obtained from the factory and closed in a `try-with-resources` block on every call.
- Uses `OctetBuffer.of(new byte[0])` for the request buffer to `catfacts/random`.
- Calls `connection.tpcall("catfacts/random", buffer, Flag.of(AtmiFlags.NOFLAG))` (or `tpacall` asynchronous variant).
- On `ErrorState.OK`: extracts UTF-8 string from the `X_OCTET` reply buffer and returns a `FactResponse`.

### 4.2 Error Handling & HTTP Status Mapping

Casual error states and connection exceptions are mapped cleanly to HTTP status codes with JSON body `{"error":"<message>"}`:

| Cause / Error Condition | Casual Error / Exception | HTTP Status | Response Body |
|---|---|---|---|
| Timeout calling Casual service | `TPETIME` / `CasualTimeoutException` | `504 Gateway Timeout` | `{"error":"Casual service timed out"}` |
| Casual service failed / unavailable | `TPFAIL`, `TPESVCERR`, `TPENOENT`, `TPESVCFAIL` | `502 Bad Gateway` | `{"error":"Casual service failed: <details>"}` |
| Casual connection refused / pool unavailable | `ResourceException`, `CasualConnectionException` | `502 Bad Gateway` | `{"error":"Unable to connect to Casual: <details>"}` |
| Empty or invalid reply buffer | Missing buffer on OK status | `502 Bad Gateway` | `{"error":"Empty reply received from Casual"}` |

### 4.3 Configuration & Environment Overrides

The application supports standard environment variables for OpenShift and local container runs:

| Property | Environment Variable | Default | Purpose |
|---|---|---|---|
| `quarkus.http.port` | `PORT` | `8080` | HTTP port |
| `quarkus.ironjacamar.casual.ra.config.host` | `CASUAL_HOST` | `casual` | Casual gateway host |
| `quarkus.ironjacamar.casual.ra.config.port` | `CASUAL_PORT` | `7771` | Casual gateway port |
| - | `CASUAL_CONFIG_FILE` | `/deployments/config/casual-config.json` | Path to casual JSON config |

`casual-config.json` is minimal and unmanaged outbound:
```json
{
  "domain": {
    "name": "backend-casual-domain"
  },
  "unmanaged": true,
  "outbound": {
    "unmanaged": true,
    "useEpoll": false
  }
}
```

## 5. Container Image: `Containerfile`

Multi-stage build using Java 25:
1. **Build stage**: Eclipse Temurin 25 JDK (or UBI 9 + Temurin 25), compiles the Quarkus fast-jar/uber-jar with `./gradlew build -x test`.
2. **Runtime stage**: Eclipse Temurin 25 JRE (or UBI 9 minimal + JRE 25).
   - Non-root user execution (compatible with OpenShift arbitrary UID / root group 0).
   - Exposes port 8080.
   - Entrypoint runs `java -jar quarkus-app/quarkus-run.jar` (or uber-jar).

## 6. Unit & Integration Tests

1. `FactResourceTest`:
   - `test_getFact_success__returns_200_and_json`: Mocked service returns uppercase fact $\rightarrow$ HTTP 200 `{"fact":"CATS ARE AWESOME"}`.
   - `test_getFact_serviceError__returns_502`: Mocked service encounters `TPFAIL`/`TPESVCERR` $\rightarrow$ HTTP 502 `{"error":"..."}`.
   - `test_getFact_timeout__returns_504`: Mocked service encounters `TPETIME` $\rightarrow$ HTTP 504 `{"error":"..."}`.
   - `test_health_ready__returns_200`: Readiness check returns UP.

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
