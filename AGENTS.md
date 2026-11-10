# AGENTS.md

## GitHub communication

We use the GitHub CLI (`gh`) to communicate with GitHub in this repository.

- Read and manage issues, pull requests, releases and workflows with `gh` (for example `gh issue view 2`, `gh pr create`).
- Do not use web scraping or fetching of github.com pages to read issues or pull requests.
- The repository we work in is <https://github.com/kjellmlarsson/casual-bob> (`kjellmlarsson/casual-bob`). Issue and pull request numbers refer to this repository, not to the upstream Casual repository at `casualcore/casual`.
- Pass `--repo kjellmlarsson/casual-bob` when running `gh` outside the repository.

## Casual documentation (OpenWiki)

The Casual source repository is checked out next to this one at `/Users/kjelllarsson/Projects/Casual/casual`. It has a generated OpenWiki in [`openwiki/`](../casual/openwiki/) that documents Casual itself. This repository's `casual/` component is built against Casual, so the wiki is the first place to look for how Casual behaves.

Use it just in time. Do not read it at the start of a task, and do not load it for work that does not touch Casual (for example the frontend or the Kubernetes manifests).

**MCP tools**

- Use the `openwiki` MCP tools when they are available: `openwiki_search`, then `openwiki_read` for the sections you need.
- Always pass `root: /Users/kjelllarsson/Projects/Casual/casual`. The wiki belongs to the Casual repository, not to this one, so this repository's path finds nothing.
- Split each search result ref at `#` into a page and a heading anchor, and pass those to `openwiki_read`.
- Do not run `openwiki_begin`, `openwiki_submit_plan`, `openwiki_submit_page` or `openwiki_finish` from this repository. They regenerate the Casual wiki.

**Without MCP**

Read [`openwiki/quickstart.md`](../casual/openwiki/quickstart.md) and follow its links. The quickstart links are written as `/openwiki/...`, which is relative to the root of the Casual repository, not to the file. Resolve them against `/Users/kjelllarsson/Projects/Casual/casual`.

**Pages most relevant to `casual/`**

| Topic | Page |
|---|---|
| `casual-build-server`, `services.yaml`, `tpsvrinit` and `tpsvrdone` | `openwiki/development/building-servers.md` |
| A working example server | `openwiki/development/example-server.md` |
| XATMI behaviour: `tpalloc`, `tpreturn`, forward | `openwiki/concepts/xatmi-implementation.md` |
| `domain.yaml`: servers, arguments, restrictions | `openwiki/configuration/domain-configuration.md` |
| Gateway listener on port 7771 | `openwiki/configuration/gateway-configuration.md` |
| `casual` CLI commands used in the acceptance criteria | `openwiki/operations/cli-reference.md` |

**Rules**

- Source code and the published headers are authoritative. The wiki is generated, so check any detail that matters against the Casual source. If the two disagree, the source wins.
- The wiki describes the Casual branch that is checked out (`feature/1.9/main` when it was written), but the container image uses the published `casual/middleware:1.8.17`. Behaviour that may differ between 1.8 and 1.9 must be confirmed against the image.
- Do not edit anything under `../casual/openwiki/`. The Casual repository's scheduled workflow regenerates it.
