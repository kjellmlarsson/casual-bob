# Spec: `casual` component

Part of [casual-bob](../SPEC.md). That overview defines the interfaces between the three components.
This document defines the `casual` component: the `catfacts/random` service, the domain definition and
the container image.

Status: draft, not yet implemented.

## 1. Purpose

Run a Casual domain that offers one service, `catfacts/random`, to other containers over Casual's
network protocol. The service returns a random cat fact, upper-cased, as plain text bytes.

## 2. Interface

| | |
|---|---|
| Listens on | TCP `7771`, Casual network protocol (gateway inbound), all interfaces |
| Service | `catfacts/random` |
| Request | any buffer, ignored. The caller sends an `X_OCTET` buffer. |
| Reply on success | `X_OCTET` buffer holding the upper-cased fact as UTF-8 bytes, no terminating NUL. Return code `TPSUCCESS`. |
| Reply on failure | `TPFAIL`, no data |
| Outbound | `GET https://catfact.ninja/fact` with `Accept: application/json` |

If `casual/example/uppercase` is not available when the forward happens, the caller gets a Casual
service error instead of `TPFAIL`. See section 4.3.

## 3. Files

| File | Purpose |
|---|---|
| `src/catfacts.cpp` | service function, `tpsvrinit`, `tpsvrdone`, the curl call |
| `src/catfacts.fact.h` | header-only `parse( body)`: JSON body to fact text. No curl, no Casual. |
| `services.yaml` | binds the service name to the C function (input to `casual-build-server`) |
| `domain.yaml` | the domain definition (section 5) |
| `test/catfacts.fact.test.cpp` | gtest unit test for `parse` |
| `build-test.sh` | builds and runs the unit test |
| `third_party/nlohmann/json.hpp`, `LICENSE.MIT` | vendored JSON library, pinned release |
| `Containerfile` | two-stage image build (section 6) |

## 4. The service

### 4.1 Build constraints

- C++23, built with `casual-build-server`.
- Only headers installed with the Casual runtime (`$CASUAL_HOME/include`) are used: `casual/xatmi.h`
  and `casual/xatmi/extended.h`. Casual's internal `common/*` headers and `casual/argument.h` are not
  installed, so they are not used.
- The server needs no direct link to `libcasual-common`. The Casual libraries it loads depend on it
  and it is present in the runtime image.
- libcurl for HTTP. nlohmann/json for parsing.
- Checked in the dev container: a server built from `casual/xatmi.h`, `casual/xatmi/extended.h` and
  libcurl alone builds, boots, and forwards a reply to `casual/example/uppercase`.

### 4.2 Server arguments

Parsed by hand from `argv` in `tpsvrinit`, since `casual/argument.h` is not available.

| Argument | Default | Meaning |
|---|---|---|
| `--url <url>` | `https://catfact.ninja/fact` | endpoint to call |
| `--timeout-ms <n>` | `5000` | total time for one HTTP call |
| `--forward <service>` | empty | service to forward the fact to. Empty: reply directly. |

An unknown argument or an invalid value makes `tpsvrinit` return `-1`, so the domain manager reports
the server as failed to start. The domain definition sets `--forward casual/example/uppercase`.

### 4.3 Behaviour of `catfacts/random`

1. Ignore the request buffer.
2. Fetch the fact (4.4). The result is the fact text, or "no fact".
3. If there is no fact: log the reason with `casual_log( c_log_error, ...)` and return
   `TPFAIL` with no data. Never forward a failure.
4. If there is a fact: copy it into a buffer from `tpalloc( X_OCTET, nullptr, size)`.
   - `--forward` empty: `tpreturn( TPSUCCESS, 0, buffer, size, 0)`.
   - `--forward` set: `casual_service_forward( service, buffer, size)`. The target replies directly
     to the original caller, and `catfacts/random` neither waits for nor sees that reply. Ownership
     of the buffer passes to Casual, so it is not freed.

Constraints that shape the code:

- `tpreturn` and `casual_service_forward` end the function with a `longjmp`. They are called as the
  last statements, outside any `try` block, and every object with a destructor (strings, curl
  handles, optionals) is destroyed in an inner scope before them.
- The forward fails if a transaction is pending. The service is declared `transaction: none` and the
  server never starts a transaction. `none` is also the right mode for a third-party HTTP call, which
  cannot take part in an XA transaction.
- The forward target must be advertised and idle when the call happens. If not, the caller gets a
  Casual service error, not `TPFAIL`.
- `casual/example/uppercase` upper-cases the bytes in place over the buffer length, so it works on an
  `X_OCTET` buffer without a terminating NUL.

### 4.4 Fetching the fact

- One curl easy handle per call. Curl's global init is done in `tpsvrinit` and its cleanup in `tpsvrdone`.
- Total timeout from `--timeout-ms`. Connect timeout is the smaller of 2000 ms and the total timeout.
- Redirects are not followed. Signals are disabled (`CURLOPT_NOSIGNAL`).
- The response body is capped at 1 MiB. The write callback stops the transfer when the cap is exceeded,
  since a size limit set before the transfer only applies when the server announces its size.
- The write callback never lets an exception pass through curl's C frames. It reports failure to curl
  instead.
- The call succeeds only if curl succeeded, the HTTP status is 200 and `parse` returns a value.
- The curl handle and header list are released on every path.

### 4.5 Parsing: `parse( body)`

`std::optional< std::string> parse( const std::string& body)`, in `catfacts.fact.h`.

| Body | Result |
|---|---|
| a JSON object with a non-empty string `fact`, with or without other fields (the API also sends `length`) | the `fact` text |
| valid JSON without `fact` | `std::nullopt` |
| `fact` present but empty, or not a string | `std::nullopt` |
| not valid JSON (for example an HTML error page), or an empty body | `std::nullopt` |

It never throws. It includes only the standard library and `nlohmann/json.hpp`.

## 5. Domain definition: `domain.yaml`

```yaml
domain:
  name: catfacts-domain

  servers:
    - alias: uppercase
      path: ${CASUAL_HOME}/example/bin/casual-example-server
      instances: 1
      restrictions:
        - casual/example/uppercase

    - alias: catfacts
      path: ${CASUAL_HOME}/bin/casual-catfacts-server
      instances: 1
      arguments: [ --forward, casual/example/uppercase]

  gateway:
    inbound:
      groups:
        - alias: in
          connections:
            - address: "0.0.0.0:7771"
```

- `uppercase` is the stock Casual example server, restricted to advertise only
  `casual/example/uppercase`. It exists only as the forward target.
- No queues, no transactions, no resources.
- The forward target is looked up when `catfacts/random` is called, not at boot, so the start order of
  the two servers does not matter.
- Checked in the dev container: `casual configuration --validate` accepts the `gateway.inbound.groups`
  form with `0.0.0.0:7771`. After `casual domain --boot`, `casual gateway --list-listeners` showed
  the listener as `listening` on `0.0.0.0:7771`.

## 6. Container image: `Containerfile`

Two stages, both on the same Casual base image and version.

**Base image:** `docker.io/casual/middleware:1.8.17`, set once with a single `ARG` used by both stages.

- Pin an explicit version. Never use `latest`: it is a stale 2020 image.
- There is no 1.9 tag. 1.8.17 is the newest published tag.
- The image is amd64 only. On an arm64 machine it runs under emulation, which is slower but works.
- It is RHEL 8.10 (UBI) with `casual-build-server`, the public headers (`casual/xatmi.h`,
  `casual/xatmi/extended.h`), libcurl headers and the CA bundle.
- There is no `g++` on the default `PATH`.

1. **Build:** run as `root` (`USER root`), add `/opt/rh/gcc-toolset-14/root/usr/bin` to `PATH` (g++ 14.2,
   C++23), and compile the server with `casual-build-server`, with the flags from 4.1 and `-lcurl`.
2. **Runtime:** the Casual base image, plus:
   - `casual-catfacts-server` copied to `$CASUAL_HOME/bin/`
   - `domain.yaml` copied to `$CASUAL_DOMAIN_HOME/configuration/domain.yaml`, replacing the example one

Properties inherited from the base image and kept:

- Runs as the non-root user `casual`. The domain directory (`/test/casual`) is group-writable for
  the root group, so OpenShift's random user IDs work.
- Log output goes to stdout.
- Entrypoint: `casual-domain-manager -c configuration/domain.yaml`.
- Exposes 7771.

The image runs no nginx and no other process outside the domain definition.

The state directory (`$CASUAL_DOMAIN_HOME`, `/test/casual`) is written at runtime. Deployments mount an
`emptyDir` there.

**Read-only root filesystem:** the domain runs with one. With it, `casual` CLI commands run inside
the container (`podman exec`, `oc exec`) fail with "casual log can't be tied stdout when using cli"
unless `CASUAL_LOG_PATH` points to a writable file, for example
`CASUAL_LOG_PATH=/test/casual/cli.log casual domain --list-servers`. The server processes are not
affected.

**Checked on `casual/middleware:1.8.17`**, with a small test server and the domain definition from
section 5, not the real catfacts server: gcc-toolset-14 builds a server with `-std=c++23`; with a
random UID `1000690000` in group `root`, a read-only root filesystem and a writable
tmpfs on `/test/casual`, the domain boots, the listener is `listening` on `0.0.0.0:7771`, TCP 7771
accepts connections and a forward to `casual/example/uppercase` returns the upper-cased reply.

## 7. Unit test

`test/catfacts.fact.test.cpp` tests `parse` only. It needs no network, no Casual and no domain, so
`build-test.sh` builds it with plain `g++ -std=c++23`, the vendored header and gtest.

| Test | Input | Expected |
|---|---|---|
| `parse__valid_json__expect_fact_text` | `{"fact":"Cats sleep a lot","length":17}` | `"Cats sleep a lot"` |
| `parse__not_json__expect_nullopt` | `<html>502 Bad Gateway</html>` | `std::nullopt`, no throw |
| `parse__json_without_fact__expect_nullopt` | `{"length":17}` | `std::nullopt` |
| `parse__empty_fact__expect_nullopt` | `{"fact":""}` | `std::nullopt` |

The test is run locally. It is not part of the image build.

## 8. Acceptance criteria

Run against the built image, with `podman run` and `podman exec` (no other containers needed).

| # | Check | Expected |
|---|---|---|
| 1 | build the image | exit 0 |
| 2 | start the container | `casual domain --list-servers` shows `catfacts` and `uppercase` running |
| 3 | `casual gateway --list-listeners` | one listener, `listening`, on `0.0.0.0:7771` |
| 4 | `casual service --list-services` | `catfacts/random` (mode `none`) and `casual/example/uppercase`, no other user service |
| 5 | call `catfacts/random` three times with `casual call` | each reply is a fact in upper case as plain text, not JSON; the facts are not all identical |
| 6 | container started with `--url` pointing at an unused local port and `--timeout-ms 1000` | the call fails with a service error within about 1 s, does not hang, and the log has the reason |
| 7 | unit test | all four tests pass |
| 8 | container running as UID `1000690000` in group `root`, with a read-only root filesystem and a writable tmpfs (or `emptyDir`) at `/test/casual` | the domain boots and criterion 5 passes |
| 9 | connect to port 7771 from another container | TCP connection succeeds |

## 9. Out of scope

TLS on the Casual port, authentication, transactions, queues, more than one instance, retries, and
caching of facts.
