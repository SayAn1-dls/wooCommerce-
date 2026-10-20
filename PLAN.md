# Plan

Status: `[ ]` todo, `[x]` done (only after the check passed).
All checks assume `export KUBECONFIG=$(k3d kubeconfig write mcpg)` and namespace `mcpg`.

## Phase 1. Cluster + store

- [x] pnpm workspace skeleton, .gitignore
- [x] k3d cluster `mcpg` with host ports 80/443 -> Traefik (scripts/dev-up.sh)
- [x] chart skeleton: Chart.yaml, values*.yaml, helpers
- [x] mariadb StatefulSet + generated secret
- [x] wordpress Deployment + PVC + Ingress shop.localhost
- [x] store-setup Job (WP-CLI, idempotent) + Role/RoleBinding on Secret woo-api
- [x] default-deny NetworkPolicies + store allows

Done when:
```
curl -s -o /dev/null -w '%{http_code}' http://shop.localhost/            # 200
scripts/place-order.sh                                                    # creates a COD order through the store checkout
scripts/wp-orders.sh                                                      # order is listed (wc_get_orders), and WP admin Orders page shows it
```

## Phase 2. Woo MCP server

- [x] apps/woo-mcp: server, woo REST client, 5 tools, /healthz /readyz, bearer check
- [x] Dockerfile (multi-stage, non-root), chart templates, NetworkPolicy (ingress from gateway only)

Done when:
```
kubectl -n mcpg port-forward svc/woo-mcp 3000:3000 &
scripts/mcp.sh http://localhost:3000/mcp "$WOO_MCP_TOKEN" list                       # 5 tools
scripts/mcp.sh http://localhost:3000/mcp "$WOO_MCP_TOKEN" call create_product name="Phase Two Mug" regular_price=199
curl -s http://shop.localhost/shop/ | grep "Phase Two Mug"
```

## Phase 3. Gateway core

- [ ] postgres StatefulSet + secret
- [ ] apps/gateway: config, db schema + drizzle migrations, crypto, seed
- [ ] upstream manager (connect, cache, health loop, list_changed)
- [ ] /mcp stateless endpoint: key auth, prefixed tools/list, tools/call routing, 20s timeout, audit
- [ ] chart templates + ingress app.localhost /api /mcp

Done when:
```
inspector --cli http://app.localhost/mcp --header "Authorization: Bearer $KEY" --method tools/call --tool-name woo__list_orders
kubectl -n mcpg exec postgres-0 -- psql -U mcpg -c "select tool_name,outcome from audit_log"
```

## Phase 4. notes-mcp + remote

- [ ] apps/notes-mcp (~80 lines), image, chart, policy
- [ ] deepwiki seeded, egress 443 allowed

Done when:
```
inspector ... --method tools/list | grep -E 'woo__|notes__|deepwiki__'
kubectl -n mcpg scale deploy/notes-mcp --replicas=0; sleep 35; curl /api/servers  # notes unreachable, woo__list_orders still ok
```

## Phase 5. Users and keys

- [ ] sessions, login rate limit, /api/auth/*, /api/me
- [ ] invites create/accept, members list/patch
- [ ] keys create/list/revoke, admin any
- [ ] role guard on admin routes

Done when:
```
revoke key -> curl /mcp with it -> 401
member cookie -> POST /api/servers -> 403
```

## Phase 6. Dashboard

- [ ] Vite React app: Login, Accept invite, Servers, Server detail, Members, My keys, Audit, Chat
- [ ] nginx image, chart, ingress /
- [ ] headless browser click-through of Part 2 actions

## Phase 7. Chat agent

- [ ] /api/chat loop over OpenAI-compatible API, shared tool path, 8 call cap, 50 KB cap
- [ ] missing key -> clean error + TODO entry

## Phase 8. Docs + prod

- [ ] README, docs/*, demo-script.md, TODO-FOR-ME.md
- [ ] values-prod.yaml renders: `helm template platform charts/platform -f charts/platform/values-prod.yaml`
- [ ] scripts/demo-check.sh passes on local
