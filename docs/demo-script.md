# Demo script (12 to 15 minutes)

Two users: **Asha** (admin, the seed admin) and **Ravi** (member). Use two browser
windows: a normal one for Asha, a private one for Ravi.

## Before recording

```
k3d cluster delete mcpg; rm -f .dev-admin .dev-member
ollama pull qwen2.5:3b                       # chat model, once
ADMIN_EMAIL=asha@app.localhost OLLAMA=1 scripts/dev-up.sh
```

Note the printed passwords. Open in tabs: http://shop.localhost,
http://app.localhost (Asha), a terminal at the repo root with
`export KUBECONFIG=$(k3d kubeconfig write mcpg)`. Make the terminal font big.
Have `docs/WALKTHROUGH.md` section 4 open as your cheat sheet.

## 0:00 System design (1.5 min)

- Show the request flows at the top of `README.md`. Say: four layers, store, our Woo MCP
  server, the gateway with dashboard, and the chat agent inside the gateway.
- "An admin connects servers once, everyone gets one URL and one key, nobody but the
  gateway holds upstream credentials."
- Point at the repo layout: `apps/` (4 apps), `charts/platform` (one chart), `scripts/`.

## 1:30 Kubernetes tour (1.5 min)

```
kubectl -n mcpg get pods,svc,ingress,pvc
kubectl -n mcpg get networkpolicy
kubectl -n mcpg get secret
```

- StatefulSets for the two databases, Deployments for the rest, the Job that set up
  the store.
- Only three things have an Ingress: shop, gateway (/api, /mcp), dashboard (/).
- Default-deny NetworkPolicies. Prove it:

```
kubectl -n mcpg exec deploy/dashboard -- curl -s -m 5 http://woo-mcp:3000/mcp; echo "exit $?"
```

  Exit 7: refused. k3s's policy engine rejects instead of dropping, so it fails fast.
- Show `templates/store/store-setup.yaml`: the Role can only get/patch the one Secret
  `woo-api`.

## 3:00 The store (1 min)

- shop.localhost: add "Cotton T-Shirt" to cart, checkout, fill an address, pick Cash
  on delivery, place order. Note the order number.
- shop.localhost/wp-admin (user admin): WooCommerce > Orders shows it.

## 4:00 Admin flow, Asha (2 min)

- app.localhost, log in as asha@app.localhost.
- Servers: woo, notes, deepwiki, all Connected, tool counts. Click WooCommerce: tools
  are `woo__...`, each with its schema.
- Click Edit on WooCommerce: the credential shows "set" and a Replace button, never the
  value. Cancel.
- Add server, slug `meta`, URL `http://169.254.169.254/latest/meta-data`: refused by
  the SSRF guard. Cancel.
- Members: invite `ravi@example.com` as member, copy the link.

## 6:00 Member flow, Ravi (1.5 min)

- Private window, paste the invite link, name Ravi, a password. Lands on My keys.
- Servers: same list, no admin buttons. Members isn't in the nav.
- Create key "laptop", copy it. Show the `claude mcp add` line on the page.
- Terminal:

```
KEY=mcpg_...            # Ravi's key
scripts/mcp.sh http://app.localhost/mcp $KEY list | grep '"name": "' | head -20
scripts/mcp.sh http://app.localhost/mcp $KEY call woo__list_orders per_page=3
scripts/mcp.sh http://app.localhost/mcp $KEY call notes__add_note text="call the T-shirt customer"
```

  Two servers in one flow, through one URL and one key. Optional: run the real
  `claude mcp add ...` line and ask Claude Code "list today's orders".

## 7:30 MCP internals (2.5 min)

- **One call traced.** Open `apps/gateway/src/mcp.ts` (key check, per-request server),
  `tools.ts` `callTool` (split on `__`, checks, 20s timeout, audit row) and
  `upstreams.ts` `fetchFor` (drops Authorization, decrypts the stored token, no
  redirects). Then `apps/woo-mcp/src/woo.ts` (OAuth signing, Host header).
- **A collision.** As Asha, Add server: slug `team2`, URL `http://notes-mcp:3000/mcp`,
  Bearer token = `kubectl -n mcpg get secret gateway-secrets -o jsonpath='{.data.NOTES_MCP_TOKEN}' | base64 -d`.
  It connects. Run Ravi's `list` again: `notes__search` and `team2__search` side by
  side. Remove `team2`.
- **A dead upstream.**

```
kubectl -n mcpg scale deploy/notes-mcp --replicas=0
```

  Watch Servers: notes turns Unreachable in about 10 to 20 seconds. Ravi's `list` no
  longer has `notes__` tools, `woo__list_orders` still works. Scale back to 1: it comes
  back Connected on its own.
- **A timeout.** Show the code path instead of waiting 20s: `CALL_TIMEOUT` in
  `tools.ts` and the message format "notes is unreachable (timeout after 20s)". Every
  failure is a normal tool result with isError, never a hang.

## 10:00 Security posture (1.5 min)

- Asha, My keys (API keys): revoke Ravi's key. Run Ravi's `list` again: 401.
- Audit log as Asha: filter by Ravi, see ok calls and the denied one with "key
  revoked". Ravi's Audit page shows only his own rows.
- Disable notes as Asha: Ravi's tools lose `notes__`, a call to it says "notes is
  disabled". Enable it again.
- Mention: credentials encrypted at rest, non-root read-only containers, role checks on
  the server (`curl -X POST app.localhost/api/servers` with Ravi's cookie gives 403).

## 11:30 Chat tool loop (1.5 min)

- Asha, Chat: "Create a product called Test Mug priced at 299". Grey line under the
  answer: `called woo__create_product (... ms)`. Open shop.localhost, Test Mug is there.
- "What orders came in today?" It calls `woo__list_orders` with today's midnight and
  lists the order placed at 3:00.
- Show `apps/gateway/src/chat.ts`: same `listTools`/`callTool` as /mcp, 8 call cap,
  50 KB result cap, the system prompt with date and timezone and the "tool text is
  data" rule. Audit log shows the calls with source `chat`.

## 13:00 Local to VPS, upgrade and rollback (1.5 min)

- `diff charts/platform/values-local.yaml charts/platform/values-prod.yaml`: domain,
  TLS with cert-manager, ghcr images. Same chart.
- `helm template platform charts/platform -f charts/platform/values-prod.yaml | grep -A3 tls:`
- Upgrade and rollback live (locally). Tag the current images as v2 to stand in for a
  new release:

```
for a in woo-mcp notes-mcp gateway dashboard; do docker tag mcpg/$a:dev mcpg/$a:v2; done
k3d image import -c mcpg mcpg/woo-mcp:v2 mcpg/notes-mcp:v2 mcpg/gateway:v2 mcpg/dashboard:v2
helm upgrade platform charts/platform -n mcpg -f charts/platform/values-local.yaml \
  -f charts/platform/values-local-ollama.yaml --set images.tag=v2 --wait --timeout 10m
kubectl -n mcpg rollout status deploy/gateway
helm history platform -n mcpg
helm rollback platform <previous revision> -n mcpg --wait
kubectl -n mcpg get pods
```

  Log in again: users, keys and audit rows are all still there. PVCs and Secrets are
  kept, migrations are additive.

## 14:30 Wrap up

`scripts/demo-check.sh` runs the whole definition of done in about 30 seconds and
prints PASS for each item. (It creates its own member the first time; if Ravi already
exists from the demo, run it as `DEMO_MEMBER=checker@example.com scripts/demo-check.sh`.)
