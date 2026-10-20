# Design and tradeoffs

Notes on why things are the way they are. Where the brief left a choice open, the
simplest option that met it was picked and is listed here.

## Shape

Four layers, one Helm chart, one namespace (`mcpg`):

1. Store: official `wordpress` and `mariadb` images. A post-install/post-upgrade Job
   with the official `wordpress:cli` image does the setup.
2. woo-mcp: our MCP server over the WooCommerce REST API. ClusterIP only.
3. Gateway (Fastify) + dashboard (React on nginx), both on `app.<domain>`. Traefik
   sends `/api` and `/mcp` to the gateway and everything else to the dashboard, so the
   session cookie is same-origin and there is no CORS.
4. Chat agent: inside the gateway, so it uses the exact same tool path as `/mcp`.

The gateway is both an MCP client (one per upstream) and an MCP server (one per
incoming request).

## Tool aggregation

`apps/gateway/src/upstreams.ts` keeps one entry per server row: the DB row, status
(`connected` / `unreachable` / `disabled`), last error, last check time, the cached
tool list and one SDK `Client` over Streamable HTTP.

- Connect = `initialize` + `tools/list` (all pages). Done on boot and on every
  add/edit/enable. The API call waits for the first check so the admin sees the real
  status straight away.
- Health loop every 15s: `ping` with a 3s timeout, falling back to `tools/list` for
  servers without ping. A quick non-timeout failure (for example the upstream dropped
  our session) gets one immediate reconnect attempt before it counts as a failure.
- Two failures in a row mark a connected server unreachable. After the first failure
  we check again 5s later instead of waiting a full 15s, so a dead server shows up in
  about 20s, well inside the 30s target. A server that was never up is unreachable
  straight away. One success marks it connected; unreachable servers are retried every
  tick, which is the automatic reconnect.
- `notifications/tools/list_changed` refreshes that server's cache.
- Status lives in memory only, as the brief asks. A restart starts from "not checked
  yet" and is correct again within a second or so.

`tools/list` on `/mcp` (`apps/gateway/src/tools.ts`, `listTools`) merges the cached
tools of servers that are enabled and connected. Unreachable servers are just left
out: one dead upstream never turns into an error for the client.

Naming: every tool is `<slug>__<tool>`, always, even with no collision, so adding a
server never renames anything. Descriptions get a `[slug]` prefix. Slugs match
`^[a-z][a-z0-9_]{1,20}$` and cannot contain `__`, so splitting on the first `__` is
unambiguous. Slugs are immutable for the same reason. notes-mcp has a tool called
plain `search` to show this: with DeepWiki or a second notes server added, both
`notes__search` and `<other>__search` exist side by side.

## Routing and failure handling

`callTool` in `apps/gateway/src/tools.ts` is the only way a tool gets called:

1. split the name on the first `__`, find the server by slug
2. unknown server or tool -> `tool_error`; disabled -> `denied`; not connected ->
   `upstream_error` with the last error. None of these touch the network.
3. forward with the SDK client and a 20s timeout. The client's own Authorization
   header never gets here: the upstream request is built by `fetchFor()` in
   `upstreams.ts`, which decrypts the stored credential at that moment and sets it.
4. timeout -> `timeout` with "notes is unreachable (timeout after 20s)"; other
   transport errors -> `upstream_error` and an immediate health check; a result with
   `isError` -> `tool_error`.
5. one audit row, whatever happened.

All failures come back as a normal tool result with `isError: true`, never as a hung
request or a JSON-RPC error, so clients and the LLM can read them. Each upstream has
its own client and its own timeout, so a slow server only slows calls to itself.

## Stateless /mcp

Each POST to `/mcp` checks the key, builds a fresh low-level SDK `Server` bound to
that user, handles the one request and is thrown away (`enableJsonResponse`, no
session id). Nothing about the client lives in gateway memory, so more replicas could
be added later. The upstream connections are per replica, which is fine: each replica
would just keep its own clients and health state. GET and DELETE on `/mcp` return 405
because there are no server-initiated streams in stateless mode.

## Auth

- Passwords: argon2id from Node's built-in `crypto.argon2` (Node 24), no native
  dependency.
- Sessions: an HMAC-signed cookie `<userId>.<expiry>` (httpOnly, SameSite=Lax, Secure
  when TLS is on), 12 hours. No sessions table: the user row is loaded on every request
  anyway, so disabling a user locks them out at once. Logout clears the cookie; a
  stolen cookie stays valid until it expires. A sessions table would fix that and is
  the first thing to add if needed.
- Role checks run in `onRequest`, before the body is parsed, so a member gets 403
  even for a malformed request. Hiding buttons in the UI is cosmetic only.
- CSRF: SameSite=Lax plus JSON-only bodies. A cross-site form can't send
  `application/json`, and Fastify refuses other content types with 415.
- Login rate limit: 10/min per IP, a small in-memory window in `ratelimit.ts`.
  `trustProxy` is on because only Traefik can reach the gateway (NetworkPolicy).
- API keys: `mcpg_` + base62 of 32 random bytes. We store the SHA-256 and the 8
  characters after `mcpg_` (the brief says "first 8 chars"; the first 8 of the whole
  key would be mostly the fixed `mcpg_`, which is useless for finding a key). Lookup
  is by that prefix, then a constant-time compare of the hashes. No cache, so revoke
  works on the next request.

## Upstream credentials

AES-256-GCM, key = SHA-256 of `GATEWAY_ENC_KEY` (random, generated by the chart and
kept across upgrades). Stored as `iv.tag.ciphertext`. Decrypted only inside
`fetchFor()` per outgoing request. The API returns `hasSecret: true/false`, never the
value; the UI shows "set" and a Replace button. Leaving the field empty on edit keeps
the old secret.

## WooCommerce specifics

- WooCommerce only accepts key/secret basic auth over HTTPS. In the cluster we talk
  HTTP to the `wordpress` Service, so woo-mcp signs requests with one-legged OAuth
  1.0a (HMAC-SHA256), which WooCommerce accepts over HTTP (`apps/woo-mcp/src/oauth.ts`).
  The signature base URL is the store's public URL, because that is what WooCommerce
  rebuilds on its side.
- woo-mcp sends `Host: shop.<domain>` to the internal Service so WordPress builds
  correct permalinks and never redirects us to the public URL. Node's `fetch` drops a
  custom Host header, so woo-mcp uses `node:http` for this one client.
- The REST key is created by the setup Job straight in `wp_woocommerce_api_keys`
  (WooCommerce has no CLI for keys) and written to the `woo-api` Secret. woo-mcp
  mounts that Secret as files and reads them per call, so it picks the key up without
  a restart.
- "Today": the store timezone (`storeTimezone`, Asia/Kolkata by default) is set in
  WordPress by the Job, passed to woo-mcp for its tool descriptions, and to the gateway
  for the chat system prompt, which spells out `after=<date>T00:00:00`.
- Currency INR, free shipping everywhere (zone 0) so checkout always has a method,
  "coming soon" mode off (new WooCommerce stores hide the shop otherwise).

## Install order

On a fresh install Helm with `--wait` waits for every Deployment to be ready before
running post-install hooks. woo-mcp's readiness checks that the WooCommerce REST routes
exist, which only happens after the hook activates WooCommerce. So `dev-up.sh` installs
without `--wait` (Helm still waits for the hook Job itself) and then runs `kubectl
rollout status` on each workload. Upgrades can use `--wait` normally.

The setup Job mounts the same `wp-content` PVC as WordPress. That PVC is
ReadWriteOnce, which on k3s `local-path` means "one node", so both pods share it fine
on a single node. On a multi-node cluster you would need an RWX class or a node
affinity for the Job.

## NetworkPolicies

Default deny for ingress and egress, then only what is listed in the brief, plus:

- store-setup also needs 443 out to download WooCommerce from wordpress.org, and the
  API server. The Kubernetes Service IP is DNAT'ed to the node on 6443 before policy
  is checked, so the rule allows TCP 443 and 6443.
- gateway egress to the internet is 443 to `0.0.0.0/0` minus private ranges, which
  also keeps it off the API server and node ports. A private LLM (local Ollama) needs
  an explicit `gateway.llm.extraEgress` entry.
- WordPress has no internet egress, so `WP_HTTP_BLOCK_EXTERNAL` is set to make update
  checks fail fast instead of hanging wp-admin.

k3s enforces policies with kube-router, which rejects rather than drops: a blocked
connection fails at once with "connection refused" instead of timing out. The proof
check (`curl woo-mcp:3000/mcp` from the dashboard pod) therefore ends in curl exit 7,
not a timeout.

## Containers

Multi-stage builds on `node:24-alpine`, `pnpm deploy --prod` for the runtime
node_modules. Our pods run as uid 1000 (nginx as 101), `readOnlyRootFilesystem`, all
capabilities dropped, no privilege escalation, RuntimeDefault seccomp, no service
account token. WordPress, MariaDB and Postgres use the official images as they are.

Both MCP servers handle SIGTERM themselves. Node is PID 1 in the container and PID 1
gets no default signal handler, so without it a pod being scaled down kept answering
health checks over the gateway's keep-alive connection for the whole 30s grace period.

## Dashboard look

The first version followed the brief's strict style (black on white, no colour,
status as a word). On request it was redesigned: dark sidebar with icons, cards,
coloured status pills, chat bubbles, a split-screen login. Still plain CSS
(`apps/dashboard/src/style.css`) and inline SVG icons, no UI kit. Inter is loaded
from Google Fonts with the system font as fallback.

## Choices the brief left open

- Chat history is not stored; the dashboard sends the conversation each time.
- The seed servers are inserted only when the `servers` table is empty, so removing a
  seeded server sticks across restarts.
- Unknown tool -> `tool_error`, disabled server -> `denied`, unreachable server ->
  `upstream_error`.
- `tools/list` calls are not audited, only `tools/call` and denied requests (a denied
  request is logged with the method or tool it tried).
- Members can't see members or pending invites. Admins can't change their own role or
  disable themselves (prevents locking the team out).
- The MCP Inspector CLI used in the checks is pinned to 2.11.0 (`scripts/mcp.sh`).
- MCP SDK 1.32.1 (`@modelcontextprotocol/sdk`). The SDK's v2 split packages exist but
  the brief names the single package.
- Helm 4 was on the machine; the chart is a plain `apiVersion: v2` chart and works with
  Helm 3 too.
- DeepWiki answered over Streamable HTTP, so no other public server was needed.

## What changes for production

- DNS: A records for `shop.<domain>` and `app.<domain>` to the VPS. `domain` in
  values is the only knob; hosts, URLs and the WordPress home URL follow from it (the
  setup Job updates `home`/`siteurl` on every run).
- Ingress: same Traefik. `ingress.tls: true` adds TLS blocks and the cert-manager
  annotation (only on one of the two `app.` Ingresses, so they share one
  Certificate). Cookies get `Secure`.
- Storage: k3s `local-path` works on one VPS. Back up `/var/lib/rancher/k3s/storage`
  or switch `storageClass` to your provider's block storage.
- Secrets: all generated ones (`mariadb-auth`, `wordpress-auth`, `postgres-auth`,
  `gateway-secrets`) use `lookup` so they survive upgrades, and each supports
  `existingSecret` if you'd rather create them yourself (sealed-secrets, SOPS, etc).
  The seed admin password comes from `--set` or the existing Secret. The `llm` Secret
  is always created by hand.
- Images: `images.prefix: ghcr.io/<you>/mcpg-` and a version tag, `pullPolicy:
  IfNotPresent`.

## Upgrade and rollback

```
helm upgrade platform charts/platform -n mcpg -f values-prod.yaml --set images.tag=0.1.1 --wait
kubectl -n mcpg rollout status deploy/gateway
helm rollback platform <rev> -n mcpg --wait
```

- PVCs (`wp-content`, the StatefulSet claims) and Secrets are kept by Helm; the
  StatefulSet volume claims are never deleted by Helm anyway.
- Schema changes are additive only (new tables, new nullable columns). Drizzle
  migrations run on gateway start; an older gateway after a rollback ignores columns
  it doesn't know. Never rename or drop in the same release that stops using
  something.
- The gateway has a 5s preStop sleep so Traefik stops sending it traffic before it
  exits; with one replica and maxUnavailable 0 an upgrade has no gap.
- The store-setup Job runs again on every upgrade and changes nothing when the store
  is already set up.
