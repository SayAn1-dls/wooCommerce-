# PRD: WooCommerce hosting with a team MCP gateway

This is the original build prompt, saved verbatim-in-substance so it survives long sessions.
Original assignment: https://docs.google.com/document/d/1wE4j9_Y_iydrkiMu7p9N_Kd4ltFztUqjssyBd4tSwkU/view

If context is lost: re-read PRD.md, PLAN.md and the git log, then continue.

---

You are a senior platform engineer. Build the complete project below from scratch, end to end, in this one session. Work autonomously until every item in "Definition of done" passes on a local Kubernetes cluster. Do not stop to ask for confirmation between steps. Everything you need is in this prompt.

## PART 1. WHAT WE ARE BUILDING

A WooCommerce hosting platform with a team MCP gateway on Kubernetes, built for the Urumi AI FDE internship (Round 1). An admin connects MCP servers once in a dashboard. Every team member then uses all of them through one MCP endpoint and one personal API key, and through a chat agent in the dashboard. Nobody except the gateway ever sees upstream credentials.

Four layers:

1. Store: WordPress + WooCommerce + MariaDB running in the cluster.
2. Woo MCP server: our own code. Exposes products and orders as MCP tools. Internal to the cluster only.
3. Gateway + dashboard: React dashboard and a Node backend. The backend is an MCP client to every registered upstream and is itself an MCP server exposing all their tools at one endpoint.
4. Chat agent: a chat in the dashboard that answers by calling tools through the gateway, acting as the logged-in user.

The chat agent and external clients reach upstream servers only through the gateway. Nothing else talks to them.

Out of scope until everything else passes: multi-store provisioning, OAuth, multiple gateway replicas.

## PART 2. USERS

Roles: admin and member. A seed admin is created on first boot from a Kubernetes Secret. Admins invite everyone else.

Admin can: see every server with status (Connected / Unreachable / Disabled) and its tools; see the WooCommerce MCP server already registered on first boot; add a server by URL plus optional credential (header or bearer), edit, disable, remove it; invite members; issue and revoke any key; read the full audit log; use chat and tools. Admin cannot read a saved upstream credential back, only replace it.

Member can: create and revoke their own API keys; connect Claude Code or Cursor with one gateway URL and their key and see every enabled server's tools; use the chat agent; see their own audit entries. Member cannot manage servers or members, see upstream credentials, or touch other people's keys.

## PART 3. TECH STACK AND REPO LAYOUT

TypeScript everywhere. One pnpm monorepo. One Helm chart.

- Runtime: Node.js LTS, pnpm workspaces.
- MCP: @modelcontextprotocol/sdk (TypeScript), Streamable HTTP transport, for both servers and the gateway's clients. Check the installed SDK version's docs and use its current API.
- Woo MCP server: Node + SDK + fetch against the WooCommerce REST API (/wp-json/wc/v3), input validated with zod.
- Gateway backend: Node + Fastify + Drizzle ORM + PostgreSQL.
- Dashboard: React + Vite + TypeScript + plain CSS. No UI kit.
- Chat agent: inside the gateway backend, using any OpenAI-compatible chat completions API (configured by LLM_BASE_URL, LLM_MODEL, LLM_API_KEY) so Gemini, Groq or a local Ollama all work.
- Store: official wordpress and mariadb images, plus a WP-CLI setup Job.
- Extra upstream 1: notes-mcp, our own tiny in-cluster server.
- Extra upstream 2: a public remote MCP server over Streamable HTTP (DeepWiki at https://mcp.deepwiki.com/mcp; if it is down or not Streamable HTTP, pick another public one and note it).
- Cluster: k3d locally (Traefik ingress, NetworkPolicy enforced), k3s on a VPS.
- Packaging: Helm 3, chart at charts/platform with values.yaml, values-local.yaml, values-prod.yaml. No Kustomize.

Repo layout:

```
mcp-gateway/
  PRD.md PLAN.md README.md TODO-FOR-ME.md
  docs/ design-and-tradeoffs.md threat-model.md extras.md WALKTHROUGH.md
  apps/
    woo-mcp/      our WooCommerce MCP server
    notes-mcp/    tiny second upstream
    gateway/      Fastify API, MCP gateway, chat agent
    dashboard/    React app
  charts/platform/ Chart.yaml values.yaml values-local.yaml values-prod.yaml
    templates/ store/ woo-mcp/ notes-mcp/ gateway/ dashboard/ postgres/ network/
  scripts/
    dev-up.sh       create k3d cluster, build images, import them, helm install
    demo-check.sh   run the definition-of-done checks, print PASS/FAIL each
```

## PART 4. COMPONENT SPECS

### 4.1 Store

- MariaDB StatefulSet with a 2Gi PVC. WordPress Deployment with a 2Gi PVC for wp-content.
- A Helm post-install/post-upgrade Job runs WP-CLI: installs WordPress, activates WooCommerce, sets currency, enables Cash on delivery, creates 3 sample products, creates a read/write REST API key for the MCP server, and writes the consumer key and secret into a Secret named woo-api. Must be idempotent: running twice changes nothing.
- The Job needs RBAC to create/update only that one Secret (Role + RoleBinding scoped to the namespace and resourceName). Least privilege.
- Storefront at shop.<domain>, admin at shop.<domain>/wp-admin, via Ingress.
- If WordPress redirects in-cluster REST calls to its public URL, have woo-mcp send the public Host header (configurable) when calling the in-cluster service.

### 4.2 Woo MCP server (apps/woo-mcp)

- Streamable HTTP MCP server on port 3000, path /mcp. ClusterIP Service, no Ingress. NetworkPolicy allows ingress only from gateway pods.
- Also requires Authorization: Bearer <WOO_MCP_TOKEN> from the gateway (defence in depth).
- Tools:
  - list_products(search?, page?, per_page? max 50) -> id, name, price, stock, status
  - create_product(name, regular_price, description?, stock_quantity?) -> creates a published simple product, returns id and permalink
  - list_orders(after?, before? ISO datetimes, status?, per_page?) -> id, date, status, total, customer name, line items
  - get_order(order_id) -> full order
  - update_order_status(order_id, status enum of Woo statuses) -> updated order
- Tool descriptions must tell the model that "today" means after = midnight in the store timezone.
- GET /healthz (liveness), GET /readyz (pings WooCommerce, readiness).
- Return clear, short error text in tool results (isError: true) when Woo fails.

### 4.3 Notes MCP server (apps/notes-mcp)

- About 80 lines. Tools: add_note(text), list_notes(), search(query). In-memory store.
- The tool is called plain "search" on purpose so name collisions with other servers are visible.
- GET /healthz. Requires a bearer token from the gateway like woo-mcp.

### 4.4 Gateway backend (apps/gateway)

One Fastify app with three faces:

- /api/* : JSON API for the dashboard, cookie session auth.
- /mcp : the single MCP endpoint, Authorization: Bearer <user api key>.
- /api/chat : the chat agent.

Upstream manager:

- On boot and whenever a server is added/edited/enabled, open an MCP client (Streamable HTTP) to each enabled upstream, initialize, tools/list. Cache per server: status, last_error, last_checked_at, tools.
- Health loop every 15s: ping (fall back to tools/list), 3s timeout. Two failures in a row -> unreachable. One success -> connected. Reconnect automatically when an unreachable server comes back. Disabled servers are never called.
- Refresh cache on notifications/tools/list_changed.

Tool naming:

- Every exposed tool is <server_slug>__<tool_name>, e.g. woo__list_orders, notes__search. Always prefix, even without a collision, so names stay stable when servers are added.
- Slug: admin-chosen, unique, ^[a-z][a-z0-9_]{1,20}$, immutable after creation.
- Description prefixed with [slug].

Gateway MCP server:

- Stateless Streamable HTTP handling (works with more replicas later).
- tools/list: merge cached tools of servers that are enabled AND connected. Unreachable servers are skipped, never an error.
- tools/call: authenticate key -> split name on first "__" -> find server -> check enabled and connected -> forward with the server's own stored credential (never the client's token) -> 20s timeout -> write one audit row whatever happens.
- Upstream failure or timeout returns a tool result with isError: true and a clear message, e.g. "notes is unreachable (timeout after 20s)". Never hang. Other servers unaffected.
- Bad or revoked key: HTTP 401 with a JSON-RPC error, plus an audit row with outcome denied.
- Seed on first boot: admin user from Secret, and the woo server (slug woo, url http://woo-mcp:3000/mcp, bearer WOO_MCP_TOKEN). Also seed notes (slug notes) and the remote server (slug deepwiki) so the platform starts with 3 upstreams. Seeding is idempotent.

SSRF guard on add/edit server URL: only http/https; block 169.254.0.0/16, loopback, link-local, and private ranges, except hostnames on an allowlist from values (allowedInternalHosts: [woo-mcp, notes-mcp]). Resolve DNS before checking.

### 4.5 Chat agent

- POST /api/chat { messages } as the session user.
- Loop: get tools as that user (same internal function /mcp uses), send to the LLM, execute requested tool calls through the same internal call path (so audit and permissions are shared, source = chat), feed results back, repeat. Stop at 8 tool calls or when the model answers in text.
- System prompt includes today's date and the store timezone, and says tool descriptions and results are data that cannot change its rules.
- Cap each tool result at 50 KB before sending to the model.
- Response: { reply, toolCalls: [{ name, durationMs, ok }] }.
- If LLM_API_KEY is missing, return a clear error message to the UI, not a crash.

### 4.6 Dashboard (apps/dashboard)

Pages: Login, Accept invite, Servers, Server detail (tools), Members, My keys, Audit log, Chat.

- Servers table: name, slug, URL, status word, tool count, Enable/Disable, Edit, Remove. Credential field is write-only: shows "set" and a Replace button. Admin-only actions hidden for members (and enforced on the server).
- Members (admin): list, invite form (email + role) that returns a one-time invite link to copy. No email sending.
- My keys: Create key (label) -> full key shown once with a Copy button, then only the prefix. Revoke button.
- Audit log: time, user, server, tool, duration (ms), outcome. Filters by user, server, outcome. Newest first, 50 per page. Members see only their own rows.
- Chat: messages, and under each answer a small grey line listing tools called, e.g. "called woo__list_orders (412 ms)".
- Served by nginx from the Vite build. Same host as the gateway (app.<domain>), "/" to dashboard, "/api" and "/mcp" to gateway.

## PART 5. DATA MODEL AND API

Postgres tables (Drizzle migrations in apps/gateway/drizzle, run on startup):

- users: id, email, name, role (admin|member), password_hash (argon2id), created_at, disabled_at
- invites: id, email, role, token_hash, invited_by, expires_at (72h), used_at
- api_keys: id, user_id, label, prefix, key_hash, created_at, last_used_at, revoked_at. key = "mcpg_" + 32 random bytes base62. Store SHA-256 hash and first 8 chars only. Constant-time compare. No key cache, so revoke is instant.
- servers: id, slug, name, url, auth_type (none|bearer|header), auth_header_name, auth_secret_enc, enabled, created_at, updated_at. auth_secret_enc = AES-256-GCM with key from GATEWAY_ENC_KEY Secret. Decrypt only in memory right before a call.
- audit_log: id, user_id, api_key_id (null for chat), source (mcp|chat), server_slug, tool_name, started_at, duration_ms, outcome (ok|tool_error|upstream_error|timeout|denied), error_message. Index started_at and user_id. Do not store tool arguments.

Server status lives in memory, not the DB.

Dashboard API (cookie session: 401 if logged out, 403 wrong role):

- POST /api/auth/login, POST /api/auth/logout, GET /api/me
- POST /api/invites/accept (token, name, password)
- GET /api/servers (all; never includes secrets), GET /api/servers/:id/tools (all)
- POST /api/servers, PATCH /api/servers/:id, DELETE /api/servers/:id (admin)
- GET /api/members, POST /api/invites, PATCH /api/members/:id (admin)
- GET /api/keys, POST /api/keys, DELETE /api/keys/:id (own keys; admin any). POST returns the full key once.
- GET /api/audit?user=&server=&outcome=&page= (admin all, member own)
- POST /api/chat

Sessions: httpOnly, SameSite=Lax cookie. Login rate limit 10/min per IP.

## PART 6. KUBERNETES AND HELM

One chart, charts/platform, namespace mcpg. Local vs VPS differ only in values files.

Workloads (probes / requests -> limits):

- mariadb: StatefulSet + PVC 2Gi, ClusterIP. mariadb-admin ping. 100m/256Mi -> 500m/512Mi
- wordpress: Deployment + PVC 2Gi, Ingress shop.<domain>. TCP 80 / GET /wp-login.php. 100m/256Mi -> 500m/512Mi
- store-setup: Job (hook). 50m/128Mi -> 300m/256Mi
- woo-mcp: Deployment, ClusterIP. /healthz /readyz. 50m/64Mi -> 250m/256Mi
- notes-mcp: Deployment, ClusterIP. /healthz. 25m/32Mi -> 100m/128Mi
- postgres: StatefulSet + PVC 1Gi, ClusterIP. pg_isready. 50m/128Mi -> 300m/256Mi
- gateway: Deployment, Ingress app.<domain> /api and /mcp. /healthz, /readyz (DB reachable). 100m/128Mi -> 500m/512Mi
- dashboard: Deployment (nginx), Ingress app.<domain> /. 25m/32Mi -> 100m/64Mi

Use generous initialDelaySeconds / startupProbes for WordPress and MariaDB so first boot doesn't crash-loop.

NetworkPolicies: default deny ingress and egress in the namespace, then allow:

- ingress controller (kube-system Traefik) -> wordpress, gateway, dashboard
- wordpress and store-setup -> mariadb; store-setup -> wordpress
- gateway -> woo-mcp, notes-mcp, postgres
- woo-mcp -> wordpress
- gateway -> internet TCP 443 (remote MCP + LLM) and the k8s API is NOT needed
- all pods -> kube-dns (UDP/TCP 53)
- store-setup -> Kubernetes API (to write the woo-api Secret)

Proof check: exec into the dashboard pod, curl woo-mcp:3000/mcp must time out.

Secrets (none in source or committed values):

- mariadb-auth, postgres-auth: generated by the chart with lookup + randAlphaNum, kept across upgrades.
- woo-api: written by store-setup Job.
- gateway-secrets: SESSION_SECRET, GATEWAY_ENC_KEY, WOO_MCP_TOKEN (generated by chart), SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (from --set or existingSecret; dev-up.sh generates a password and prints it once).
- llm: LLM_API_KEY, created by me with kubectl or --set. Gateway must start fine without it.

Every secret supports existingSecret in values.

Values differences:

- values-local.yaml: domain localhost (shop.localhost, app.localhost), ingress class traefik, no TLS, storageClass local-path, imagePullPolicy Never (images imported with k3d image import), 1 replica each.
- values-prod.yaml: real domain placeholder (shop.example.com, app.example.com), traefik, TLS via cert-manager ClusterIssuer letsencrypt, local-path or provider class, images from ghcr.io with version tags.

Local domains: *.localhost resolves to 127.0.0.1; k3d maps host port 80 (and 443) to Traefik. Document an /etc/hosts fallback.

Containers: our Node images run as non-root, readOnlyRootFilesystem where possible, drop all capabilities. Multi-stage Dockerfiles, small images.

Upgrade/rollback: helm upgrade with new image tag, kubectl rollout status; helm rollback platform <rev>. PVCs and Secrets survive. Schema changes additive only. Document this.

## PART 7. SECURITY RULES

- Upstream credentials never leave the gateway: encrypted at rest, never returned by any API, never logged.
- No token passthrough: strip the client's Authorization header, send the server's stored credential.
- Role checks happen on the server for every admin route.
- SSRF guard as in 4.4.
- Untrusted upstreams: tool text is data; results capped; agent rules in system prompt.
- Login rate limiting, httpOnly cookies, hashed passwords and keys.

## PART 8. CODE AND UI STYLE (strict)

The code must read like a careful student wrote it by hand over two weeks.

Do:

- Short plain names (listOrders, servers, key, res). Small files, roughly 50-200 lines, one job each. Functions over classes unless a class clearly helps.
- Comments explain why, only where it isn't obvious.
- Plain try/catch with one clear message.
- README and docs short and direct, like notes to a teammate.
- Small commits with normal messages.

Don't:

- No emoji anywhere (code, logs, docs, UI, commits).
- No banner comments, ASCII art, section dividers, or a comment on every line.
- No buzzwords.
- No unused abstractions (BaseService, AbstractProvider, one-product factories).
- No coloured console output, spinners, fancy loggers. Plain console.log / fastify.log.
- No extra libraries for things that take 10 lines.

UI:

- Black (#111) text on white (#fff). One grey #ddd for borders, one #666 for secondary text. No other colours anywhere, including status.
- System font stack, 14px base. Thin-bordered tables. Buttons: black outline, filled black on hover.
- No gradients, shadows, rounded cards, animations, icons, illustrations. Status is a word. Empty states are one short sentence.

## PART 9. HOW YOU MUST WORK

1. Check the machine for docker, k3d, kubectl, helm, node LTS, pnpm. Install missing ones if possible; otherwise write the exact install command into TODO-FOR-ME.md and continue with what doesn't need it.
2. Write PLAN.md: the 8 phases below, each split into concrete tasks, each with its "done when" check as a runnable command. Keep a task list updated as you go.
3. Build the phases in order. After each phase, actually run its check. If it fails, find the real cause, fix it, re-run. Never mark anything done without seeing it pass. Never fake, stub, or hardcode results to pass a check.
4. Commit after each phase.
5. If blocked by something only I can give (like the LLM key), use a placeholder, write exactly what I must do in TODO-FOR-ME.md, and keep building.
6. If something here is unclear, choose the simplest option that meets the requirements and note it in docs/design-and-tradeoffs.md. Do not ask me.

Phases:

1. Cluster + store. Done when: shop.localhost loads, a COD order can be placed, the order shows in WP admin (verify via WP-CLI or REST).
2. Woo MCP server. Done when: via port-forward, MCP Inspector CLI lists 5 tools and create_product makes a product visible on the storefront.
3. Gateway core: Postgres, migrations, seed admin and servers, upstream manager, /mcp with prefixing, routing, timeouts, audit. Done when: Inspector CLI against http://app.localhost/mcp with a key calls woo__list_orders and an audit row exists.
4. notes-mcp + remote server. Done when: tools/list shows tools from all 3; scaling notes-mcp to 0 keeps woo working and notes shows unreachable within 30s.
5. Users and keys: login, invites, roles, key create/revoke. Done when: revoked key gets 401 next call; member gets 403 on admin routes.
6. Dashboard. Done when: every admin and member action in Part 2 can be done by clicking (check with a headless browser or by hitting the same API calls the UI makes).
7. Chat agent. Done when (with an LLM key present): creating "Test Mug" at 299 works and "what orders came in today?" returns today's order. Without a key: clean error and a TODO entry.
8. Docs + prod values. Done when: all docs below exist, values-prod.yaml renders cleanly with helm template, demo-check.sh passes on local.

## PART 10. DEFINITION OF DONE

1. scripts/dev-up.sh brings everything up from zero with one command and prints the URLs and the seed admin login.
2. shop.localhost: buy a product with Cash on delivery; the order shows in WP admin.
3. Seed admin logs in at app.localhost, sees 3 servers Connected with their tools, invites a member; the member accepts and creates a key.
4. With the member's key an MCP client (Inspector CLI) lists tools from all 3 servers and calls woo__list_orders successfully. One flow uses two servers (woo__list_orders then notes__add_note).
5. Chat agent creates "Test Mug" at 299 (visible on storefront) and answers "what orders came in today?" correctly.
6. Revoked key -> 401 on next call. Disabling notes removes its tools from chat and client. Scaling notes-mcp to 0 keeps others working and shows notes Unreachable.
7. Every call above is in the audit log under the right user, including the denied one.
8. scripts/demo-check.sh runs 2, 4, 6, 7 from the terminal and prints PASS/FAIL each. It passes.
9. values-prod.yaml is complete for a k3s VPS with a real domain and cert-manager TLS; helm template renders it with no errors.

## PART 11. DELIVERABLES IN THE REPO

- README.md: local setup, VPS (k3s) setup, how to place an order, how to connect Claude Code / Cursor (include: `claude mcp add --transport http team-gateway http://app.localhost/mcp --header "Authorization: Bearer mcpg_xxx"`), how to use the chat, how to put the LLM key in.
- docs/design-and-tradeoffs.md: architecture choices; how tool aggregation, routing and failure handling work; what changes for production (DNS, ingress, storage class, secrets); upgrade and rollback.
- docs/threat-model.md: shared upstream credentials (what a member can do with a credential they never see); why client tokens aren't passed upstream; untrusted upstreams with tool descriptions written to manipulate the model; what one team member can do to another; what happens if an admin adds a malicious server.
- docs/extras.md: which stand-out items are done (SSRF guard, default-deny NetworkPolicies, non-root containers, encrypted upstream credentials, least-privilege RBAC for the setup Job, prod values with TLS) and where in the code.
- docs/WALKTHROUGH.md: written for a student who must defend this live in an interview. Explain each component, the Kubernetes resources, how one tool call travels from client to store and back, how credentials move, where isolation is enforced, and why each choice was made. Plain language, with file paths. End with the 15 questions an interviewer is most likely to ask, each with a short answer.
- docs/demo-script.md: the exact clicks and commands for a 12-15 minute video covering system design, the full definition-of-done flow with two users (admin Asha, member Ravi), Kubernetes tour, MCP internals (one call traced, a collision, a timeout, a dead upstream), security posture, the chat tool loop, and local-to-VPS with helm upgrade and rollback.

## PART 12. WHEN YOU FINISH

Run the full definition of done one final time, then give:

1. A PASS/FAIL table for every item.
2. Everything left in TODO-FOR-ME.md.
3. The exact commands to bring it up from zero and to record the demo.
