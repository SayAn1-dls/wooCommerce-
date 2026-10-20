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
