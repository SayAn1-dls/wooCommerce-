# Things only you can do

## 1. Put in a real LLM key for the chat (optional locally, needed on the VPS)

Chat works locally with Ollama (`values-local-ollama.yaml`, model `qwen2.5:3b`), which is
how it was tested. For a hosted model, pick one and create the `llm` Secret.

Gemini (default in values.yaml, free tier key at https://aistudio.google.com/apikey):

```
kubectl -n mcpg delete secret llm --ignore-not-found
kubectl -n mcpg create secret generic llm --from-literal=LLM_API_KEY=<your key>
kubectl -n mcpg rollout restart deploy/gateway
```

Groq instead: same Secret, plus
`--set gateway.llm.baseUrl=https://api.groq.com/openai/v1 --set gateway.llm.model=llama-3.3-70b-versatile`
on `helm upgrade`.

If you switch from Ollama back to a hosted model, run helm upgrade without `-f values-local-ollama.yaml`.

## 2. Deploy to a VPS (needs your domain, server and GitHub account)

Follow README "VPS setup (k3s)". In short:

1. Buy/point a domain: A records for `shop.<domain>` and `app.<domain>` to the VPS IP.
2. `curl -sfL https://get.k3s.io | sh -` on the VPS, then install cert-manager and the
   `letsencrypt` ClusterIssuer (commands in the README).
3. Build and push the four images to `ghcr.io/<you>/mcpg-<app>:0.1.0` and make the
   packages public.
4. Edit `charts/platform/values-prod.yaml`: `domain`, `images.prefix`, `wordpress.adminEmail`,
   `gateway.seedAdminEmail`, and the email in the ClusterIssuer.
5. `helm upgrade --install platform charts/platform -n mcpg --create-namespace -f charts/platform/values-prod.yaml --set gateway.seedAdminPassword='<long password>' --timeout 20m`
6. Create the `llm` Secret (section 1) and restart the gateway.

## 3. Record the demo

Script with exact clicks and commands: `docs/demo-script.md`.

## Notes

- This machine had Helm 4.3; the chart is a plain v2 chart and works with Helm 3 too.
- Ollama must be running (`ollama serve` or the app) for chat with `OLLAMA=1`.
