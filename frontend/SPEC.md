# Spec: `frontend` component

Part of [casual-bob](../SPEC.md). That overview defines the interfaces between the three components.
This document defines the `frontend` component: the Carbon React page, the nginx configuration and
the container image.

Status: draft.

## 1. Purpose

Serve a one-page web app with a button. Pressing the button calls `GET /api/fact` and shows the
returned (upper-cased) cat fact in a tile. It shows a loading state and an error notification. nginx
serves the static build and proxies `/api/` to the backend, so the browser sees one origin and no CORS
is needed.

## 2. Interface

| | |
|---|---|
| Listens on | HTTP `8080`, all interfaces |
| `GET /` | The page (`index.html`). Static assets are under `/assets/`. |
| `GET /api/*` | Proxied to `http://${BACKEND_HOST}:${BACKEND_PORT}`, path unchanged, status and body passed through |
| `GET /healthz` | `200 ok` from nginx itself, never proxied. Used for the liveness and readiness probes. |
| Used backend contract | `GET /api/fact` → `200 {"fact":"<text>"}`, or `502`/`504` with `{"error":"<message>"}` (overview section 3) |

### 2.1 Configuration

The backend location is set by environment variables. On OpenShift they come from a ConfigMap that the
frontend Deployment reads with `envFrom`. In compose they are set on the service. The same image runs
in both. The backend is internal only, so the connection is plain HTTP to the in-cluster Service.

| Variable | Default | Purpose |
|---|---|---|
| `BACKEND_HOST` | `casual-bob-backend` | Host name of the backend Service (in compose, the backend service name) |
| `BACKEND_PORT` | `8080` | Port of the backend |

## 3. Files

| File | Purpose |
|---|---|
| `package.json`, `package-lock.json` | Dependencies and scripts (`dev`, `build`, `test`, `lint`) |
| `vite.config.ts`, `tsconfig.json`, `index.html` | Vite + TypeScript setup. The dev server proxies `/api` to `localhost:8080`. |
| `src/main.tsx` | Mounts `<App/>` and imports the styles |
| `src/App.tsx` | The page: heading, `Button`, `Tile`, `InlineLoading`, `InlineNotification` |
| `src/api.ts` | `fetchFact(signal)`: calls `/api/fact` and returns the fact text or throws `FactError` with a user-readable message |
| `src/styles.scss` | `@use '@carbon/react'` plus the few layout rules (no inline styles). Carbon's default font loading is kept. |
| `src/App.test.tsx`, `src/api.test.ts` | Vitest + Testing Library tests with `fetch` mocked |
| `nginx.conf.template` | Server block with static serving, `/api/` proxy, `/healthz` and SPA fallback |
| `start.sh` | Container entrypoint: renders `nginx.conf.template` from the environment, then starts nginx in the foreground |
| `Containerfile` | Two stages: Node build, then UBI nginx runtime |
| `.dockerignore`, `.gitignore` | Exclude `node_modules/`, `dist/` |

## 4. Behaviour

### 4.1 Page

One page, Carbon `white` theme, within a `Grid`/`Column` layout (single centred column on wide screens).

| State | What is shown |
|---|---|
| Idle (nothing fetched yet) | Heading "Cat facts", `Button` "Get a cat fact", `Tile` with muted text "Press the button to get a cat fact." |
| Loading | `Button` disabled, `InlineLoading` with description "Fetching a cat fact…" (`status="active"`). The previous fact stays visible until the new one arrives. |
| Success | `Tile` shows the fact text. The button is enabled and keeps the label "Get a cat fact". |
| Error | `InlineNotification` (`kind="error"`, `lowContrast`, title "Could not get a cat fact", subtitle = message). The previous fact stays visible. The notification is cleared when the next request starts or the user closes it. |

- The fact is displayed exactly as received. The upper-casing is done by Casual, not here.
- Only one request is in flight at a time (the button is disabled while loading).
- Loading and error text is announced to screen readers (`InlineLoading` is a live region,
  `InlineNotification` uses `role="status"`).
- The page makes no direct calls to Casual or catfact.ninja, and uses no analytics. The only external
  assets are Carbon's default IBM Plex font files.

### 4.2 Error handling in `fetchFact`

| Situation | Message shown |
|---|---|
| `502`/`504` with `{"error":"…"}` | The `error` text from the body |
| Any other non-200 status, or a body that is not the expected JSON (for example an HTML error page from nginx or the router when `backend` is down) | "The service is unavailable (HTTP `<status>`)." |
| Network failure | "Could not reach the server." |
| No reply within 10 seconds (`AbortController`) | "The request timed out." |
| `200` but `fact` is missing or not a string | "The server returned an unexpected reply." |

### 4.3 nginx

- Serves `dist/` with `try_files $uri /index.html`. Hashed assets under `/assets/` get a long
  `Cache-Control`. `index.html` gets `no-cache`.
- `location /api/` proxies to the backend with `proxy_read_timeout 15s` (longer than the backend's own
  Casual timeout, so the backend's `504` reaches the browser instead of an nginx one).
- The backend name is resolved at request time (`resolver` plus a variable in `proxy_pass`), so nginx
  still starts when the backend is not up yet. `start.sh` takes the resolver address from
  `/etc/resolv.conf`, which is the cluster DNS on OpenShift.
- `start.sh` renders only the `BACKEND_*` variables (and the resolver) into the template, so nginx's own
  `$variables` are left alone.
- It sends `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`.

## 5. Container image: `Containerfile`

1. **Build stage**: `registry.access.redhat.com/ubi9/nodejs-22`, runs `npm ci` (dependency layer cached
   before the sources are copied), then `npm run build`. Tests are not run in the image build (same as
   backend).
2. **Runtime stage**: a UBI 9 nginx image (same registry as backend, so the cluster pulls from one
   place).
   - Copies `dist/`, `nginx.conf.template` and `start.sh` with group 0 ownership.
   - Runs as non-root and works with an arbitrary OpenShift UID. nginx listens on `8080`. The rendered
     config, pid file and temp paths are under `/tmp`.
   - Needs only `/tmp` writable, so the Deployment can use `readOnlyRootFilesystem: true` with an
     `emptyDir` at `/tmp`.
   - Exposes `8080`. Entrypoint is `start.sh`.

Pinned tags: build `ubi9/nodejs-22:1-1793903405`, runtime `ubi9/nginx-126:1-1793639981` (nginx 1.26.3).
The runtime image ships `envsubst`, so `start.sh` uses it. The files are placed in `/opt/app-root/`
(`html/`, `nginx.conf.template`, `start.sh`), and the rendered config goes to `/tmp/nginx.conf`.
Pulling the tags from an OpenShift build is checked in acceptance criterion 12.

## 6. Deploy manifests

Kustomize resources in `deploy/base/frontend/`, following the layout and naming of `deploy/base/backend/`.
They are added to `deploy/base/kustomization.yaml` (`resources: - frontend`). The Argo CD Application and
the dev overlay need no change: the Application's `ignoreDifferences` already covers the container
`image` of every Deployment, and the overlay includes `../../base`.

| File | Content |
|---|---|
| `imagestream.yaml` | `ImageStream` `casual-bob-frontend` |
| `buildconfig.yaml` | `BuildConfig` `casual-bob-frontend`: Git source `https://github.com/kjellmlarsson/casual-bob.git`, `ref: main`, `contextDir: frontend`, Docker strategy with `dockerfilePath: Containerfile`, output to `ImageStreamTag` `casual-bob-frontend:latest` |
| `configmap.yaml` | `ConfigMap` `casual-bob-frontend` with `BACKEND_HOST: casual-bob-backend` and `BACKEND_PORT: "8080"` |
| `deployment.yaml` | `Deployment` `casual-bob-frontend`, 1 replica, label `app: casual-bob-frontend`. Container `frontend` on `8080`, `envFrom` the ConfigMap, the `image.openshift.io/triggers` annotation following `casual-bob-frontend:latest` (placeholder image as in the backend). Liveness and readiness probes on `GET /healthz`. Security context: `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, all capabilities dropped. `emptyDir` mounted at `/tmp`. |
| `service.yaml` | `Service` `casual-bob-frontend`, ClusterIP, port `8080` |
| `route.yaml` | `Route` `casual-bob-frontend` to the Service, TLS `edge` termination, `insecureEdgeTerminationPolicy: Redirect`. No `host`, so OpenShift generates it. |
| `kustomization.yaml` | Lists the files above |

- The ConfigMap values match the backend Service in `deploy/base/backend/service.yaml` (name
  `casual-bob-backend`, port `8080`). Changing one requires changing the other.
- The pod does not set a user ID, so OpenShift assigns one from the namespace range.
- The repo is public, so the manifests hold no secrets and no cluster-specific host names.
- After a change to the frontend code the image is rebuilt with `oc start-build casual-bob-frontend`
  (overview section 6). No one runs `oc apply`.

## 7. Tests

`src/api.test.ts`
- `test_fetchFact_ok__returns_fact_text`
- `test_fetchFact_502_with_error_body__throws_backend_message`
- `test_fetchFact_504_with_error_body__throws_backend_message`
- `test_fetchFact_html_error_page__throws_unavailable_with_status`
- `test_fetchFact_network_failure__throws_could_not_reach`
- `test_fetchFact_no_reply__throws_timed_out` (fake timers)
- `test_fetchFact_missing_fact__throws_unexpected_reply`

`src/App.test.tsx`
- `test_initial__shows_button_and_placeholder_no_fetch`
- `test_click__disables_button_and_shows_loading_then_fact`
- `test_click_error__shows_error_notification_and_keeps_button_enabled`
- `test_second_click_after_error__clears_notification`

## 8. Acceptance criteria

| # | Check | Expected |
|---|---|---|
| 1 | `npm ci && npm test` | All tests pass |
| 2 | `npm run build` | Exits 0, no TypeScript errors, `dist/` contains `index.html` |
| 3 | `npm run lint` | No errors |
| 4 | Carbon MCP `code_audit` on `src/` | No error-severity findings (tokens, accessibility, no inline styles) |
| 5 | `podman build -t localhost/casual-bob-frontend:dev frontend/` | Exits 0 |
| 6 | Run the image with `BACKEND_HOST` pointing at a stub returning `{"fact":"HELLO"}` | `GET /` returns 200 HTML, `GET /api/fact` returns the stub reply, `GET /healthz` returns 200 |
| 7 | Run the image with no backend reachable | Container starts. `GET /api/fact` returns an error status (not a hang). The page shows the error notification. |
| 8 | Run with random UID (for example `1000690000`) and read-only root fs with a tmpfs at `/tmp` | Boots and serves `/` |
| 9 | Browser check at 320px, 672px and 1056px widths | No horizontal scroll, button and tile remain usable |
| 10 | `kubectl kustomize deploy/overlays/dev` (or `oc kustomize`) | Exits 0 and includes the frontend `ImageStream`, `BuildConfig`, `ConfigMap`, `Deployment`, `Service` and `Route` |
| 11 | `oc apply --dry-run=server -k deploy/overlays/dev` against the cluster | All frontend resources are accepted |
| 12 | After Argo CD syncs and `oc start-build casual-bob-frontend --follow` completes | The build succeeds, the `casual-bob-frontend` pod becomes Ready, Argo CD shows the Application Synced and Healthy, and the Deployment rolled out the new image through the trigger |
| 13 | Open the frontend Route in a browser (HTTPS) and press the button | An upper-cased cat fact is shown in the tile. This is the end-to-end check of the whole path (overview section 1). |
| 14 | Scale `casual-bob-backend` to 0 and press the button | The error notification is shown, and the frontend pod stays Ready |

Full-path testing with `podman-compose` belongs to the `compose.yaml` step (overview section 7) and is
not an acceptance criterion here.

## 9. Out of scope

Authentication, routing (single page only), internationalisation, state management libraries,
analytics, theme switching and `compose.yaml`. The backend and `casual` manifests, the Argo CD
Application and the dev/prod overlays are not changed by this component, except for adding `frontend` to
`deploy/base/kustomization.yaml`. The only Route is the one to `frontend` (overview section 6).
`backend` stays internal.
