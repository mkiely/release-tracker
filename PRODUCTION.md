# Production mode & extension model

How to run Release Tracker "for real" against a locally-running sync service, how
the two repositories relate, how to build and deploy, and how others (including a
private fork at your company) can add their own work-tracking connectors.

> **Scope.** This is an *offline-first desktop-class web app*, not a hosted SaaS.
> "Production" here means **a built, optimized artifact a user runs on their own
> machine** alongside a local sync service — not a cloud deployment. All app data
> lives in the browser's `localStorage`; the only backend is the user's own local
> sync service translating *their* work-tracking system.

---

## 1. The two pieces

| Piece | Repo | Runtime | Owns | Holds secrets? |
|---|---|---|---|---|
| **Release Tracker** (the app) | `release-tracker` | Browser SPA (static files) | Canonical schema, `applySync`, UI, the **Sync Contract** (OpenAPI) | No — can't; it's a browser |
| **work-truck** (the service) | `work-truck` | Local Node/Hono process | Auth, per-backend fetch, mapping → app schema | Yes — in its own env |

The dependency arrow points **one way**: work-truck *conforms* to the app-owned
contract (`packages/sync-contract/openapi.yaml`). The app imports zero
backend-specific code; work-truck imports the app's contract types (codegen, never
hand-copied). This is the invariant the whole extension model rests on.

---

## 2. Dev vs. production topology

**Development (today) — two origins:**

```
browser :5173  ──CORS──▶  work-truck :8787  ──▶  JIRA / CLI / …
(vite dev)                (tsx watch)
```

Two processes, two ports, cross-origin → work-truck needs CORS
(`allowOrigin` in `work-truck/src/server.ts`). Fine for DX (HMR, watch).

**Production (recommended) — one origin:**

```
browser :8787  ──same-origin──▶  work-truck :8787
   │                              ├── GET /connectors, POST /releases/sync, …
   └── GET / (the built SPA)      └── serveStatic(release-tracker/dist)
```

**work-truck serves the app's built `dist/` *and* the API from one port.** This
collapses an entire class of problems:

- **No CORS** — same origin, so `APP_ORIGIN` / `allowOrigin` become unnecessary.
- **No mixed-content / TLS friction** — one scheme, one host.
- **No build-time API URL** — the app calls a **relative** base (`''`), so
  `VITE_SYNC_BASE_URL` is no longer inlined into the bundle and **one build
  artifact works on any machine/port**. (Today `import.meta.env.VITE_SYNC_BASE_URL`
  is baked in at build time; a hardcoded `localhost:8787` would ship in the bundle.)
- **One thing to launch** — a single process and a single URL for the user.

---

## 3. What lives where

```
release-tracker/                 # the app (this repo)
  src/                           # SPA source
  packages/sync-contract/        # ← the contract, app-owned (OpenAPI + generated TS)
  dist/                          # `vite build` output (served by work-truck in prod)

work-truck/                      # the service (sibling repo)
  src/server.ts                  # 3 contract routes + (new) static file serving
  src/registry.ts                # the connector registry (one line per backend)
  src/connectors/<type>/         # one anti-corruption layer per backend
  src/contract.generated.ts      # codegen'd from release-tracker's openapi.yaml
```

Two changes turn the dev topology into the production one:

1. **App:** make the sync base URL default to relative when unset (so a same-origin
   build needs no env). One edit in `src/sync/client.ts` (`createSyncClient`).
2. **Service:** add static serving of the app's `dist/` to `work-truck/src/server.ts`
   (Hono's `serveStatic`), and skip CORS when serving same-origin.

---

## 4. Build & run (end user)

Assuming both repos are checked out as **siblings** (`work-truck` already resolves
the contract via `../release-tracker/...`):

```sh
# 1. Build the app to static files
cd release-tracker
npm ci
npm run build                 # → release-tracker/dist

# 2. Run the service, pointed at that dist, serving everything on one port
cd ../work-truck
npm ci
SERVE_APP=../release-tracker/dist npm start      # http://localhost:8787

# 3. (optional) enable connectors and provide their credentials via env
JIRA_TOKEN=…  SERVE_APP=../release-tracker/dist  npm start
```

Open `http://localhost:8787`. With no connectors configured, the app runs in pure
local mode (it already degrades gracefully — `createSyncClient` falls back to the
fixture client, and the UI hides connector controls when `/connectors` is empty).

**Suggested ergonomics to add:**

- A `SERVE_APP` (or `APP_DIST`) env var in work-truck; when set, mount `serveStatic`.
- A root launcher script (or `npm run start:prod` in work-truck) that builds the app
  if `dist/` is stale, then boots the server — one command for non-developers.
- A fetch **timeout + fallback** in `HttpSyncClient` so a *down* service degrades to
  local mode with a toast instead of hanging.

**Distribution options** (increasing polish, pick per audience):

| Audience | Approach |
|---|---|
| Developers | Clone both repos, the two commands above |
| Internal non-devs | Ship a work-truck **release tarball with `dist/` prebuilt inside it** + a start script; no app repo needed at runtime |
| Future / overkill | Single binary via `bun build --compile`, `pkg`, or wrap in Tauri for a real desktop app |

---

## 5. Repo strategy — keep them separate

Earlier a monorepo looked attractive (one place to bump the contract). **The
private-fork requirement flips that recommendation: keep two repos.**

- A custom connector is a **work-truck-only** change (see §7). With two repos you
  fork *only the service* privately and keep tracking the app as pristine upstream.
- A monorepo would force your private fork to carry the whole app too, making
  upstream syncs noisier and accidentally coupling your private work to app history.

The one cost of two repos — the cross-repo contract reference — is worth paying, and
is best hardened as follows.

### The contract across repo boundaries

Today `work-truck/package.json`'s `gen:contract` reads
`../release-tracker/packages/sync-contract/openapi.yaml` by **relative path**, which
assumes sibling checkouts. For a distributed/forked world, make the contract a
**pinned dependency** instead of a path:

- **Option A (simplest):** publish `packages/sync-contract` to a registry
  (`@release-tracker/sync-contract`, public for OSS) and have work-truck depend on a
  **version range**. The private fork pins the version it conforms to.
- **Option B:** consume the contract as a **git dependency / submodule** pinned to a
  tag. No registry needed.

Either way, add a **version handshake**: expose the contract version from the service
(e.g. on `GET /connectors`) and have the app warn on mismatch. In a shipped artifact,
app↔service version skew is the most likely failure mode.

### Going further: publish the app as a package (recommended)

The cleanest integration is to make the app a **dependency** work-truck installs,
rather than a sibling checkout it path-references. Publish **two** packages:

- `@release-tracker/sync-contract` — OpenAPI + generated types (the §5 contract pkg).
- `@release-tracker/app` — the **prebuilt `dist/`** shipped as package files.

work-truck then `npm install`s both, pins versions, and serves
`node_modules/@release-tracker/app/dist`. This removes the sibling-checkout
assumption *and* the relative-path `gen:contract` in one move — integration becomes
"one pinned dependency."

- **It strengthens the private fork (§7), not the opposite.** The company forks
  **only work-truck**, adds its connector, and consumes the public app + contract as
  pinned deps — getting upstream app updates via `npm update`, never forking the app
  or carrying app source privately. (Only a custom *UI/view* would need an app fork; a
  custom *connector* never does.) You keep two repos but get monorepo-like ergonomics
  without the "fork everything" penalty.
- **Prerequisite:** the relative-API-base change (§3) must land first, or the
  published `dist` bakes in a `localhost:8787` URL and is wrong everywhere. The
  package model depends on an environment-neutral artifact.
- **Dependency direction stays clean:** service → app artifacts; the app never depends
  on the service, so the boundary is intact. The app stops being a thing you "run" and
  becomes a build-time asset you "bundle" — which matches reality (a static SPA isn't a
  server).
- **Lighter-weight variants** (same pinning, no public registry):

  - **Git-tag (git URL) dependency.** Point the dep straight at a ref:
    `"@release-tracker/app": "github:your-org/release-tracker#v1.2.0"` (or a commit SHA
    for immutability, or `#semver:^1.2.0`). npm clones the repo at that ref. Caveat: a
    git dep installs **source, not build output** — npm runs the package's `prepare`
    script on install, so release-tracker needs `"prepare": "vite build"` + `files:
    ["dist"]`, and the **consumer builds on install** (needs the toolchain, pays the
    build cost). Subdir packages (e.g. `packages/sync-contract`) are awkward — git deps
    resolve the repo *root's* package.json. Best for the small contract package.

  - **GitHub Release tarball (`npm pack`).** In CI on a version tag: `npm run build &&
    npm pack` produces `release-tracker-1.2.0.tgz` (the same artifact `npm publish`
    would — only `files`, i.e. the built `dist`), then `gh release create v1.2.0
    *.tgz`. Consumers install the **prebuilt** artifact by URL:
    `"@release-tracker/app": "https://github.com/your-org/release-tracker/releases/download/v1.2.0/release-tracker-1.2.0.tgz"`.
    No build-on-install, deterministic, subdir-safe (pack each package). Best for the
    **app** package (you want a prebuilt SPA, not a build-on-install). Don't confuse
    with GitHub's auto-generated *source* tarball (`/archive/...`), which still needs a
    build.

  Both work for private repos (SSH / token URL), so the private work-truck fork can
  pull a public or private app this way.

- **Recommended hybrid:** git-tag dep for `sync-contract` (tiny, builds instantly) +
  Release tarball for `@release-tracker/app` (ship the prebuilt `dist/`). Graduate to
  **GitHub Packages** (npm semantics, org-scoped, GitHub-token auth) when you want the
  nicest consumer ergonomics — especially for the private fork. Keep the runtime
  version handshake regardless: a pinned dep guarantees what you *built* against; the
  handshake catches a stale *running* service.

---

## 6. The extension model (open source)

Two independent axes of customization. Know which one you're on — it decides whether
you touch the service, the app, or both.

| You want to… | Lives in | Fork needed? |
|---|---|---|
| Pull from a **new work-tracking system** (custom **connector**) | work-truck | Service only (or no fork — see §7) |
| Build a **tailored view / different UI** of the data | release-tracker | App fork |
| Change the **shared schema/contract** | release-tracker (`sync-contract`) | App (and every conformer follows) |

Because the app is connector-agnostic, **the common case — "I use a different
backend" — never requires forking the app.** That's the payoff of the contract
boundary, and it's what makes the OSS project genuinely reusable: anyone can teach
work-truck about *their* system without understanding the app.

---

## 7. Private fork with a custom connector (your work scenario)

You need a private fork to add a connector for your company's source-of-truth system.
This is a **service-side, additive change** and work-truck is already built for it:
`src/registry.ts` is a one-line-per-backend registry, the `Connector` interface in
`src/connectors/types.ts` is the only contract, and `src/connectors/acme/` is a
ready-to-fill stub (HTTP and CLI patterns both exist — see `work-truck/CONNECTORS.md`).

**Recommended: minimal private fork of work-truck only.**

```
origin    = git@github.com:your-org/work-truck-private.git   (private)
upstream  = git@github.com:<oss-owner>/work-truck.git        (public)
```

Keep the custom connector **isolated to its own directory** so upstream merges stay
clean:

```
src/connectors/acme-internal/      # everything company-specific lives here
  index.ts  mapping.ts  fixtures.ts  mapping.test.ts
src/registry.ts                    # +1 line registering it (the only shared-file edit)
```

- Credentials live in the **service's env** (e.g. `ACME_TOKEN`), surfaced through the
  connector's `meta.configFields` for *non-secret* routing params only — never sent by
  the app, never committed. Keep them in `.env` (gitignored) and document in
  `.env.example`.
- Sync upstream with `git fetch upstream && git merge upstream/main`. Because your
  connector is one directory plus one registry line, conflicts are limited to that
  single line.
- Optionally guard it behind an env flag like the Acme stub
  (`...(process.env.ENABLE_ACME_INTERNAL === '1' ? [AcmeInternalConnector] : [])`) so
  the public-shaped build stays unchanged.

**Better long-term: no fork at all (plugin connectors).** Evolve work-truck's registry
to also discover connectors from **external packages** — e.g. read a
`WORK_TRUCK_CONNECTORS` env list of module specifiers, or auto-load any installed
`work-truck-connector-*` package. Then your company connector lives in a **separate
private repo** that depends on work-truck (and the contract) as libraries, and you run
upstream work-truck **unforked** with your private connector installed alongside:

```
work-truck            (public, unmodified)
@your-org/wt-connector-acme   (private package, implements the Connector interface)
→ run: WORK_TRUCK_CONNECTORS=@your-org/wt-connector-acme npm start
```

This is the cleanest end state: the OSS service never forks, your private code never
mixes with upstream history, and contract conformance is enforced by the shared types
package both sides import. The isolated-directory fork (above) is the pragmatic step
that gets you running today; the plugin loader is the refactor that removes the fork
entirely.

---

## 8. Summary of changes this direction implies

**release-tracker (app):**
- `createSyncClient` defaults to a **relative** base when `VITE_SYNC_BASE_URL` is unset.
- `HttpSyncClient`: add fetch timeout + graceful fallback to local mode.
- Publish/pin `packages/sync-contract` so conformers depend on a version, not a path.
- Expose contract version for the handshake.

**work-truck (service):**
- Add `serveStatic` of the app's `dist/` behind a `SERVE_APP`/`APP_DIST` env var.
- Skip CORS when serving same-origin; keep it for the cross-origin dev path.
- `npm run start:prod` launcher; release tarball with `dist/` prebuilt.
- (Later) connector **plugin loader** so private connectors need no fork.

**Neither:**
- The schema, derivations, `applySync`, and the three-route contract stay as-is.

---

## 9. A friendly hostname (keep the port)

Recommended: serve at **`http://release-tracker.localhost:8787`** — a memorable
bookmark — and **keep the port**. Keeping `:8787` is deliberate: it avoids binding a
privileged port, which avoids running work-truck as root, which avoids breaking
CLI-executing connectors (a root subprocess has `$HOME=/root` and can't find the
user's credentials/config — see below). The port is cosmetic; the root-avoidance is
architectural.

Why `*.localhost`:

- It's **RFC-reserved to resolve to loopback**, and Chrome/Firefox resolve
  `*.localhost` → 127.0.0.1 automatically **and treat it as a secure context** — so
  you keep the secure-context privilege that a `.test` host would lose, with no TLS.
- **Avoid `.local`** (mDNS/Bonjour clash on macOS).

A small **optional setup script** makes it reliable everywhere. It earns its keep on
macOS **Safari** and non-browser tools (`curl release-tracker.localhost:8787/...`),
which do *not* auto-resolve `*.localhost` on macOS; for Chrome users it's redundant
but harmless. Requirements for the script:

- **Idempotent** — grep `/etc/hosts` before appending; never duplicate the line
  (`127.0.0.1  release-tracker.localhost`).
- **sudo-aware** — it edits `/etc/hosts`; prompt clearly.
- **Cross-platform** — Windows hosts path is
  `C:\Windows\System32\drivers\etc\hosts`.
- **Reversible** — ship a matching uninstall that removes the line.
- **Optional** — the app works on `localhost:8787` regardless; this is just a nicer
  bookmark.

### If you truly want no port (not recommended)

Dropping `:8787` means listening on 80/443. **Don't do it by running work-truck as
root** — a CLI connector inherits the service's user/env; as root, `$HOME=/root`, so
it won't find the user's credentials/config and runs the subprocess as root (a
security regression). Instead keep work-truck **unprivileged, as the user**, on 8787
and put [Caddy](https://caddyserver.com) in front (binds 80/443, auto local TLS).
Inbound hostname and outbound CLI execution are independent, so the proxy doesn't
affect connectors — it's just more moving parts (proxy + cert) for little gain.
</content>
