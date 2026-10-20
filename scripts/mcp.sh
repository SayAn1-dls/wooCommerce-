#!/usr/bin/env bash
# Thin wrapper over the MCP Inspector CLI.
#   scripts/mcp.sh <url> <token> list
#   scripts/mcp.sh <url> <token> call <tool> [key=value ...]
set -euo pipefail
url=$1 token=$2 action=$3
shift 3
cmd=(npx -y @modelcontextprotocol/inspector@2.11.0 --cli "$url" --transport http
  --header "Authorization: Bearer $token")
if [ "$action" = "list" ]; then
  "${cmd[@]}" --method tools/list
else
  tool=$1
  shift
  args=()
  for a in "$@"; do args+=(--tool-arg "$a"); done
  "${cmd[@]}" --method tools/call --tool-name "$tool" ${args[@]+"${args[@]}"}
fi
