# Walkthrough

For defending this project live. It explains every part, how a call travels, where the
secrets go and why each choice was made. File paths are relative to the repo root.

## 1. The idea in one paragraph

A team runs a WooCommerce store. They want AI tools (Claude Code, Cursor, a chat box)
to work with the store and a few other MCP servers. Without a gateway every person
would configure every server and hold every credential. With the gateway an admin adds
each server once, with its credential, and every person gets one URL and one personal
key. The gateway holds the credentials, checks who is calling, routes each call to the
right server, and writes an audit row. The chat in the dashboard uses the same path.

## 2. The components

### Store: WordPress + WooCommerce + MariaDB

- `charts/platform/templates/store/mariadb.yaml`: StatefulSet with a 2Gi volume, a
  headless Service, probes with `mariadb-admin ping`. A StatefulSet because it is a
  database with its own volume and a stable name.
- `templates/store/wordpress.yaml`: Deployment with a 2Gi PVC for `wp-content`,
  Service, Ingress for `shop.<domain>`. Strategy `Recreate` because the PVC is
  ReadWriteOnce: old and new pods must not run at once. Startup probe gives it 5
  minutes on first boot so it never crash-loops.
- `templates/store/store-setup.yaml` + `files/store-setup.sh`: a Helm hook Job
  (post-install and post-upgrade). An init container copies WordPress core from the
  same image the site runs, then WP-CLI installs WordPress, installs and activates
  WooCommerce, sets currency (INR) and timezone, enables Cash on delivery, adds free
  shipping, creates 3 products and creates a REST API key. Every step checks first, so
  a second run changes nothing. It writes the key into the `woo-api` Secret with curl
  against the Kubernetes API.
- RBAC for that Job: a Role allowing `get`/`patch`/`update` on `secrets` with
  `resourceNames: [woo-api]`. RBAC can't restrict `create` by name, so the chart
  creates `woo-api` (empty) itself and the Job only patches it.

### woo-mcp (`apps/woo-mcp`)

- `src/index.ts`: plain `node:http` server. `/mcp` needs `Authorization: Bearer
  <WOO_MCP_TOKEN>`, compared in constant time. Each POST gets a fresh `McpServer` and a
  stateless `StreamableHTTPServerTransport`. `/healthz` is liveness, `/readyz` checks
  that WooCommerce's REST routes answer.
- `src/tools.ts`: the 5 tools with zod schemas. Any WooCommerce error becomes a short
  `isError: true` result. The `list_orders` description tells the model that "today"
  means `after` = midnight in the store timezone.
- `src/woo.ts`: the WooCommerce client. Reads the key from the mounted Secret on every
  call. Sends `Host: shop.<domain>` so WordPress builds the right links.
- `src/oauth.ts`: OAuth 1.0a signing, because WooCommerce only accepts plain key/secret
  over HTTPS and in-cluster traffic is HTTP.

### notes-mcp (`apps/notes-mcp/src/index.ts`)

75 lines. `add_note`, `list_notes`, `search`. In memory. The tool is called `search` on
purpose to show name collisions are handled by prefixing.

### Gateway (`apps/gateway`)

| File | Job |
| --- | --- |
| `src/index.ts` | builds the Fastify app, waits for Postgres, runs migrations, seeds, starts upstreams |
| `src/config.ts` | reads env |
| `src/db/schema.ts`, `drizzle/` | tables and the generated SQL migration |
| `src/crypto.ts` | argon2id passwords, AES-256-GCM, SHA-256, base62 keys |
| `src/seed.ts` | seed admin from the Secret; woo, notes, deepwiki when `servers` is empty |
| `src/upstreams.ts` | one MCP client per server, status cache, health loop |
| `src/tools.ts` | `listTools` and `callTool`: the one path for /mcp and chat |
| `src/mcp.ts` | the `/mcp` endpoint |
| `src/keys.ts` | create and check API keys |
| `src/session.ts` | signed cookie sessions, `requireUser`, `requireAdmin` |
| `src/ssrf.ts` | URL check for added servers |
| `src/audit.ts` | writes audit rows |
| `src/chat.ts` | the agent loop |
| `src/routes/*.ts` | the dashboard API |

### Dashboard (`apps/dashboard`)

React + Vite, plain CSS in `src/style.css` (black on white, grey borders, no other
colours). A 30-line router in `src/router.tsx`. One file per page in `src/pages/`.
Built into static files and served by nginx as a non-root user (`nginx.conf`, port
8080). Same host as the gateway, so cookies just work.

## 3. Kubernetes resources

All in namespace `mcpg`, from one chart (`charts/platform`):

- StatefulSets: `mariadb`, `postgres` (each with a volume claim template)
- Deployments: `wordpress`, `woo-mcp`, `notes-mcp`, `gateway`, `dashboard`
- Job (Helm hook): `store-setup`, with ServiceAccount, Role, RoleBinding, ConfigMap
- Services: one per workload, all ClusterIP (MariaDB and Postgres headless)
- Ingresses: `shop` (shop.<domain> -> wordpress), `gateway` (app.<domain> /api and
  /mcp), `dashboard` (app.<domain> /)
- PVC: `wp-content` (plus the StatefulSet claims)
- Secrets: `mariadb-auth`, `wordpress-auth`, `postgres-auth`, `gateway-secrets`
  (generated, kept across upgrades), `woo-api` (filled by the Job), `llm` (made by hand)
- NetworkPolicies: `default-deny`, `allow-dns`, `allow-ingress-controller`, and one per
  app in `templates/network/`

Values files: `values.yaml` has defaults, `values-local.yaml` (k3d, localhost, no TLS,
`pullPolicy: Never`) and `values-prod.yaml` (real domain, TLS, ghcr images) only
override what differs. `values-local-ollama.yaml` is an optional extra for a local LLM.

## 4. One tool call, end to end

Ravi in Claude Code asks "what orders came in today?". Claude Code decides to call
`woo__list_orders` with `after=2026-10-21T00:00:00`.

1. Claude Code POSTs JSON-RPC `tools/call` to `http://app.localhost/mcp` with
   `Authorization: Bearer mcpg_...`.
2. k3d forwards port 80 to Traefik. Traefik matches host `app.localhost`, path `/mcp`,
   and sends it to the `gateway` Service. The `allow-ingress-controller` policy lets
   Traefik in.
3. `src/mcp.ts`: `checkKey()` looks the key up by its 8-char prefix, compares SHA-256
   hashes in constant time, checks it isn't revoked and the user isn't disabled, and
   updates `last_used_at`. Bad key: 401 plus an audit row with outcome `denied`.
4. A fresh SDK `Server` is created for this request with Ravi as the caller. The
   transport parses the JSON-RPC and calls our `tools/call` handler.
5. `callTool()` in `src/tools.ts` splits `woo__list_orders` on the first `__`: server
   `woo`, tool `list_orders`. It checks the server is enabled, connected and has that
   tool.
6. It calls the upstream with the cached SDK client and a 20s timeout. That client's
   `fetchFor()` (`src/upstreams.ts`) removes any Authorization header, decrypts woo's
   stored bearer token and sets it, and refuses redirects.
7. The `gateway` NetworkPolicy allows egress to woo-mcp:3000; woo-mcp's policy allows
   ingress only from gateway pods.
8. woo-mcp checks the bearer token, validates the arguments with zod and calls
   `woo('GET', '/orders', ...)`. That signs the request with OAuth 1.0a and sends it to
   `http://wordpress/wp-json/wc/v3/orders` with `Host: shop.localhost`. woo-mcp's
   policy allows egress only to wordpress:80.
9. WooCommerce checks the signature against the key in its table, queries orders,
   returns JSON. woo-mcp trims it to id, date, status, total, customer and line items.
10. The result comes back to the gateway. `callTool()` writes one audit row (user, key
    id, source `mcp`, `woo`, `list_orders`, start time, duration, outcome `ok`) and
    returns the result. The request ends and the per-request server is dropped.

The chat takes the same path from step 5: `src/chat.ts` calls `listTools()` and
`callTool()` directly with `source: 'chat'` and no key id.

## 5. How credentials move

| Credential | Created by | Stored in | Who reads it |
| --- | --- | --- | --- |
| WooCommerce REST key | store-setup Job | `woo-api` Secret | woo-mcp only (mounted file) |
| WOO_MCP_TOKEN / NOTES_MCP_TOKEN | chart (random) | `gateway-secrets` | woo-mcp / notes-mcp (env), gateway copies it encrypted into `servers` at seed |
| Upstream credential added by an admin | admin in the dashboard | `servers.auth_secret_enc`, AES-256-GCM | gateway, decrypted per outgoing request |
| GATEWAY_ENC_KEY, SESSION_SECRET | chart (random) | `gateway-secrets` | gateway |
| User API key | user on My keys | only its SHA-256 and prefix in `api_keys` | shown once to the user |
| Passwords | user | argon2id hash in `users` | nobody |
| LLM_API_KEY | you, by hand | `llm` Secret | gateway |

The user's API key stops at the gateway. Upstreams never see it.

## 6. Where isolation is enforced

- Network: default-deny NetworkPolicies. Only Traefik reaches wordpress, gateway and
  dashboard. Only the gateway reaches woo-mcp, notes-mcp and Postgres. Only woo-mcp
  and the setup Job reach WordPress. The gateway can reach the internet on 443 but not
  private ranges. Proof: from the dashboard pod, `curl woo-mcp:3000/mcp` is refused.
- Upstream auth: woo-mcp and notes-mcp require a bearer token as a second fence.
- API: `requireAdmin` on every admin route, in `onRequest`, before anything else.
- Data: members only see their own keys and audit rows (filtered in SQL on the server).
- Kubernetes API: only the setup Job has a token, and it can patch one Secret.
- Containers: non-root, read-only root filesystem, no capabilities.

## 7. Why these choices

- **One gateway process for API, MCP and chat**: one tool path, so audit and
  permissions can't drift. Splitting them would be more moving parts for no gain at
  this size.
- **Stateless /mcp**: nothing per-client in memory, so adding replicas later is a
  values change. Cost: a new SDK server per request, which is cheap.
- **Always prefix tool names**: a stable name beats a short one; adding a server never
  renames tools users rely on.
- **Status in memory, not in the DB**: it changes every 15 seconds and is rebuilt in a
  second on boot. Writing it to Postgres would be churn.
- **Fastify + Drizzle + Postgres**: Fastify has built-in JSON schema validation, so no
  extra validation library; Drizzle gives typed queries and plain SQL migrations.
- **Node's built-in argon2**: no native module to compile in Alpine.
- **Signed cookie sessions**: no session table to manage; the user row is checked on
  every request anyway.
- **OAuth 1.0a for WooCommerce**: the alternative was faking HTTPS with
  `X-Forwarded-Proto`, which makes WordPress produce https links on a plain-HTTP local
  setup.
- **Helm with lookup-generated Secrets**: one command to install, nothing secret in the
  repo, and passwords survive upgrades.
- **k3d locally, k3s on the VPS**: same distribution, same Traefik, same NetworkPolicy
  engine, so local behaviour matches production.

## 8. Questions you will probably get

1. **Why a gateway instead of giving everyone the server configs?**
   Credentials stay in one place, one key per person can be revoked alone, every call
   is audited, and adding a server reaches the whole team at once.

2. **How does the gateway know which server a tool belongs to?**
   Every exposed name is `<slug>__<tool>`. It splits on the first `__`. Slugs can't
   contain `__`, so that's unambiguous.

3. **Two servers both have `search`. What happens?**
   Nothing breaks: they show as `notes__search` and `<other>__search`. We always
   prefix, even without a collision, so names never change when servers are added.

4. **What if an upstream goes down mid-call?**
   The call has a 20s timeout and returns a tool result with `isError: true` and a
   message like "notes is unreachable (timeout after 20s)". Other servers have their
   own clients and aren't affected. The health loop marks it unreachable within about
   20s and its tools drop out of `tools/list`.

5. **How do you detect a dead server, and why not instantly?**
   Ping every 15s with a 3s timeout; after one failure we check again in 5s; two in a
   row mark it unreachable. One blip shouldn't hide a server's tools from everyone.

6. **Does the upstream ever see the user's key?**
   No. `fetchFor()` deletes the Authorization header and sets only the stored
   credential. Forwarding it would let any upstream replay user keys against the
   gateway.

7. **How are upstream credentials stored?**
   AES-256-GCM with a key from a Kubernetes Secret, decrypted only when building an
   outgoing request. The API only says whether one is set. To change it you replace it.

8. **How does revoking a key work, and how fast?**
   It sets `revoked_at`. Keys are checked against the DB on every request with no
   cache, so the very next call gets 401 and an audit row with outcome `denied`.

9. **Why is /mcp stateless?**
   So any replica can answer any request. No sticky sessions, no shared session store.

10. **How do you stop an admin from adding `http://169.254.169.254`?**
    The SSRF guard: http/https only, resolve DNS, reject loopback, link-local and
    private ranges unless the host is on the allowlist (woo-mcp, notes-mcp), check
    again on every connect, refuse redirects. And the NetworkPolicy blocks private
    ranges for the gateway anyway.

11. **What stops a malicious tool description from hijacking the chat?**
    Prefixed names, a system prompt that says tool text is data, a 50 KB cap per
    result, at most 8 tool calls, and the agent can only do what the logged-in user
    could. It reduces the risk; confirmation for write tools would be the next step.

12. **How does the chat know what "today" means?**
    The system prompt has today's date and time in the store timezone and says
    `after=<date>T00:00:00`. The `list_orders` description says the same. WooCommerce
    reads `after` in the store timezone.

13. **What do NetworkPolicies give you here?**
    Default deny, then one rule per needed flow. The dashboard can't reach woo-mcp, the
    store can't reach Postgres, the gateway can't reach the Kubernetes API. Even with a
    bug in the gateway the blast radius stays small.

14. **How do you upgrade and roll back without losing data?**
    `helm upgrade` with a new image tag; `helm rollback` to go back. PVCs and Secrets
    are kept, generated passwords are reused via `lookup`, migrations are additive only
    so an older gateway works on a newer schema.

15. **What would you do next for production?**
    Per-role tool permissions (read-only woo tools for members), confirmation for write
    tools in chat, a sessions table so logout revokes server-side, per-key rate limits,
    Postgres backups, more gateway replicas (the /mcp path is already stateless), and
    OAuth for MCP clients instead of static keys.
