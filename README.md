# MCP Gateway for a WooCommerce store

A WooCommerce store plus a team MCP gateway, on Kubernetes. An admin connects MCP
servers once in a dashboard. Everyone on the team then uses all of them through one
MCP endpoint and their own API key, or through the chat in the dashboard. Only the
gateway ever holds the upstream credentials.

How requests flow:

- `shop.<domain>` -> Traefik -> WordPress -> MariaDB
- `app.<domain>/` -> Traefik -> dashboard (nginx)
- `app.<domain>/api` and `/mcp` -> Traefik -> gateway -> Postgres
- gateway -> woo-mcp -> WordPress REST API
- gateway -> notes-mcp, and gateway -> DeepWiki over the internet

- `apps/woo-mcp` our MCP server for products and orders (WooCommerce REST API)
- `apps/notes-mcp` a tiny in-memory notes server, the second upstream
- `apps/gateway` Fastify: dashboard API, the `/mcp` endpoint, the chat agent
- `apps/dashboard` React app served by nginx
- `charts/platform` one Helm chart for all of it
- DeepWiki (`https://mcp.deepwiki.com/mcp`) is the third, public upstream

More detail: [docs/design-and-tradeoffs.md](docs/design-and-tradeoffs.md),
[docs/threat-model.md](docs/threat-model.md), [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

## Local setup (k3d)

Needs Docker (give it 4 GB RAM or more), k3d, kubectl, Helm and openssl. On a Mac:

```
brew install k3d kubectl helm
```

Then, from the repo root:

```
scripts/dev-up.sh
```

It creates the `mcpg` k3d cluster (ports 80 and 443 go to Traefik), builds the four
images, imports them, installs the chart and waits. First run takes about three
minutes. At the end it prints the URLs, the WordPress admin password and the seed
admin login (the password is shown once and kept in `.dev-admin`).

- Store: http://shop.localhost (WP admin at /wp-admin, user `admin`)
- Dashboard: http://app.localhost
- MCP endpoint: http://app.localhost/mcp

`*.localhost` resolves to 127.0.0.1 on macOS and most Linux setups. If it doesn't
for you, add this to `/etc/hosts`:

```
127.0.0.1 shop.localhost app.localhost
```

Check everything works:

```
scripts/demo-check.sh
```

It places a real order, uses a member's key through the MCP Inspector CLI, revokes
it, disables notes, kills notes-mcp, and reads the audit log. It prints PASS/FAIL per
item.

Tear down: `k3d cluster delete mcpg` (and `rm .dev-admin .dev-member`).

## Placing an order

Open http://shop.localhost, add a product to the cart, check out, pick "Cash on
delivery". The order shows in WP admin under WooCommerce > Orders.
`scripts/place-order.sh` does the same from the terminal through the Store API (the
same calls the checkout page makes) and `scripts/wp-orders.sh` lists recent orders.

## Users

The seed admin logs in at http://app.localhost. Admins invite people from Members:
enter an email and role, copy the one-time link (valid 72 hours) and send it
yourself. The invitee opens the link, picks a name and password, and lands on My keys.

## Connecting Claude Code or Cursor

Create a key on My keys (it is shown once). Then:

```
claude mcp add --transport http team-gateway http://app.localhost/mcp --header "Authorization: Bearer mcpg_xxx"
```

Cursor, in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "team-gateway": {
      "url": "http://app.localhost/mcp",
      "headers": { "Authorization": "Bearer mcpg_xxx" }
    }
  }
}
```

Tools show up as `<server>__<tool>`, for example `woo__list_orders`,
`notes__search`, `deepwiki__ask_wiki_question`. Revoking the key stops it on the next call.

Quick test without an editor:

```
scripts/mcp.sh http://app.localhost/mcp mcpg_xxx list
scripts/mcp.sh http://app.localhost/mcp mcpg_xxx call woo__list_orders per_page=5
```

## Chat

The Chat page talks to any OpenAI-compatible chat completions API. It gets the same
tools you would get with your key, calls them as you, and shows which tools it called
under each answer. Try "what orders came in today?" or "create a product called Test
Mug priced at 299".

### LLM key

Without a key the gateway runs fine and the chat says it is not set up.

Hosted model (Gemini is the default in `values.yaml`):

```
kubectl -n mcpg create secret generic llm --from-literal=LLM_API_KEY=<key>
kubectl -n mcpg rollout restart deploy/gateway
```

For another provider also set `gateway.llm.baseUrl` and `gateway.llm.model`, e.g.
Groq: `https://api.groq.com/openai/v1` with `llama-3.3-70b-versatile`.

Local Ollama instead (this is what the chat was tested with):

```
ollama pull qwen2.5:3b
OLLAMA=1 scripts/dev-up.sh
```

That adds `values-local-ollama.yaml`, which points the gateway at
`http://host.k3d.internal:11434/v1` and opens that one address in the gateway's
NetworkPolicy. Small coder models (qwen2.5-coder) print tool calls as text instead of
calling them; use a general model with tool support.

## VPS setup (k3s)

1. A VPS with 2 vCPU / 4 GB, ports 80 and 443 open. Point `shop.<domain>` and
   `app.<domain>` (A records) at it.
2. Install k3s (it ships Traefik and enforces NetworkPolicy):
   `curl -sfL https://get.k3s.io | sh -`
3. Install cert-manager and a Let's Encrypt issuer:

   ```
   helm repo add jetstack https://charts.jetstack.io
   helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true
   kubectl apply -f - <<EOF
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: you@example.com
       privateKeySecretRef:
         name: letsencrypt
       solvers:
         - http01:
             ingress:
               ingressClassName: traefik
   EOF
   ```

4. Push images to ghcr.io (from your laptop):

   ```
   for app in woo-mcp notes-mcp gateway dashboard; do
     docker build --platform linux/amd64 -t ghcr.io/<you>/mcpg-$app:0.1.0 -f apps/$app/Dockerfile .
     docker push ghcr.io/<you>/mcpg-$app:0.1.0
   done
   ```

   Make the packages public, or add an imagePullSecret.
5. Copy `values-prod.yaml`, set `domain`, `images.prefix`, the admin emails, then:

   ```
   helm upgrade --install platform charts/platform -n mcpg --create-namespace \
     -f charts/platform/values-prod.yaml --set gateway.seedAdminPassword='<long password>' --timeout 20m
   kubectl -n mcpg create secret generic llm --from-literal=LLM_API_KEY=<key>
   kubectl -n mcpg rollout restart deploy/gateway
   ```

   Do not use `--wait` on the first install (see design doc, "Install order").

## Upgrade and rollback

```
helm upgrade platform charts/platform -n mcpg -f charts/platform/values-prod.yaml --set images.tag=0.1.1 --wait
kubectl -n mcpg rollout status deploy/gateway
helm history platform -n mcpg
helm rollback platform <revision> -n mcpg --wait
```

PVCs and Secrets carry `helm.sh/resource-policy: keep` and generated passwords are
reused through `lookup`, so neither an upgrade nor a rollback touches data. Database
migrations are additive only, so an older gateway still runs on a newer schema.

## Repo notes

- `PRD.md` the original brief, `PLAN.md` the phases and their checks
- `TODO-FOR-ME.md` what only a human can do (LLM key, VPS)
- pnpm workspace: `pnpm install`, `pnpm build`
