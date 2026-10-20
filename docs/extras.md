# Extras

The stand-out items from the brief, all done, and where to find them.

| Item | Where |
| --- | --- |
| SSRF guard on server URLs (http/https only, DNS resolved, private/link-local/loopback blocked, allowlist from values, re-checked on every connect, redirects refused) | `apps/gateway/src/ssrf.ts`, used in `routes/servers.ts` and `upstreams.ts` (`connect`, `fetchFor`); allowlist `gateway.allowedInternalHosts` in `charts/platform/values.yaml` |
| Default-deny NetworkPolicies, then one policy per allowed flow | `charts/platform/templates/network/` (`base.yaml` has default-deny, DNS and Traefik) |
| Non-root containers, read-only root filesystem, all capabilities dropped, no SA token | `mcpg.nodeSecurity` / `mcpg.containerSecurity` in `templates/_helpers.tpl`; Dockerfiles in `apps/*/Dockerfile`; nginx on 8080 as uid 101 in `apps/dashboard/nginx.conf` |
| Encrypted upstream credentials (AES-256-GCM, decrypted per request, write-only in API and UI) | `apps/gateway/src/crypto.ts`, `upstreams.ts` `fetchFor()`, `routes/servers.ts` `view()`, `apps/dashboard/src/pages/ServerForm.tsx` |
| Least-privilege RBAC for the setup Job (get/patch on the one `woo-api` Secret; the chart owns the Secret so no `create` is needed) | `charts/platform/templates/store/store-setup.yaml`, `templates/store/secrets.yaml` |
| Prod values with TLS (cert-manager ClusterIssuer, Secure cookies, ghcr images with tags) | `charts/platform/values-prod.yaml`; renders with `helm template platform charts/platform -f charts/platform/values-prod.yaml` |

Smaller things that came along:

- Secrets generated with `lookup` + `randAlphaNum` and kept across upgrades, all with
  `existingSecret` (`mcpg.secretValue` in `_helpers.tpl`)
- Idempotent store setup, including reusing the REST key if WooCommerce still knows it
  (`charts/platform/files/store-setup.sh`)
- woo-mcp signs WooCommerce calls with OAuth 1.0a so the REST key works over in-cluster
  HTTP (`apps/woo-mcp/src/oauth.ts`)
- Constant-time compares for API keys, the MCP bearer tokens and passwords
- Role checks before body parsing, login rate limit, SameSite cookies, JSON-only API
- Health checks confirm a failure after 5s, dead upstream shows in about 20s;
  SIGTERM handling so scaled-down pods stop at once
- `scripts/demo-check.sh` runs the definition of done end to end
- Optional local LLM via Ollama with one extra values file
