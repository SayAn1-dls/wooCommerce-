#!/usr/bin/env bash
# Runs definition-of-done items 2, 4, 6 and 7 against the local cluster and
# prints PASS or FAIL for each. Exit code is the number of failures.
set -uo pipefail
cd "$(dirname "$0")/.."

APP=http://app.localhost
SHOP=http://shop.localhost
NS=mcpg
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
admin_jar=$work/admin
member_jar=$work/member
failures=0

pass() { echo "PASS  $1"; }
fail() {
  echo "FAIL  $1"
  [ -n "${2:-}" ] && echo "      $2"
  failures=$((failures + 1))
}
# json '<python expression on d>'  reads JSON from stdin
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
post() { curl -s -b "$1" -c "$1" -H 'content-type: application/json' -d "$3" "$APP$2"; }
mcp_list() { scripts/mcp.sh "$APP/mcp" "$1" list 2>/dev/null; }
mcp_call() { scripts/mcp.sh "$APP/mcp" "$@" 2>/dev/null; }
# raw tools/call with curl, for tools the Inspector refuses to call because they are not listed
mcp_raw() {
  curl -s -X POST -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
    -H "Authorization: Bearer $1" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$2\",\"arguments\":{}}}" "$APP/mcp"
}
server_id() { curl -s -b "$admin_jar" "$APP/api/servers" | json "[s['id'] for s in d if s['slug']=='$1'][0]"; }
server_status() { curl -s -b "$admin_jar" "$APP/api/servers" | json "[s['status'] for s in d if s['slug']=='$1'][0]"; }

echo "setting up: admin login and demo member"
admin_email=$(sed -n 1p .dev-admin)
admin_password=$(sed -n 2p .dev-admin)
post "$admin_jar" /api/auth/login "{\"email\":\"$admin_email\",\"password\":\"$admin_password\"}" >/dev/null

# the demo member (Ravi) is created through a real invite the first time; the
# password is kept in .dev-member (gitignored) for later runs
member_email=${DEMO_MEMBER:-ravi@example.com}
if [ ! -f .dev-member ]; then
  member_password=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-14)
  link=$(post "$admin_jar" /api/invites "{\"email\":\"$member_email\",\"role\":\"member\"}" | json "d.get('link','')")
  token=${link##*/}
  post "$member_jar" /api/invites/accept "{\"token\":\"$token\",\"name\":\"Ravi\",\"password\":\"$member_password\"}" >/dev/null
  printf '%s\n%s\n' "$member_email" "$member_password" > .dev-member
  chmod 600 .dev-member
fi
member_password=$(sed -n 2p .dev-member)
member_id=$(post "$member_jar" /api/auth/login "{\"email\":\"$member_email\",\"password\":\"$member_password\"}" | json "d.get('id','')")
if [ -z "$member_id" ]; then
  echo "could not log in as $member_email (delete .dev-member if the cluster was rebuilt)"
  exit 1
fi
member_key=$(post "$member_jar" /api/keys '{"label":"demo-check"}' | json "d['key']")
member_key_id=$(curl -s -b "$member_jar" "$APP/api/keys" | json "d[0]['id']")
echo "member $member_email, new key ${member_key:0:13}..."
echo

# 2. a Cash on delivery order placed in the shop shows up in WP admin
order_id=$(scripts/place-order.sh "$SHOP" | awk '{print $1}')
wp_password=$(kubectl -n $NS get secret wordpress-auth -o jsonpath='{.data.admin-password}' | base64 -d)
wp_jar=$work/wp
curl -s -c "$wp_jar" -b "$wp_jar" -o /dev/null "$SHOP/wp-login.php"
curl -s -c "$wp_jar" -b "$wp_jar" -o /dev/null --data-urlencode "log=admin" --data-urlencode "pwd=$wp_password" \
  -d 'wp-submit=Log+In&testcookie=1' "$SHOP/wp-login.php"
# captured first: with pipefail, "cmd | grep -q" fails when grep stops reading early
wp_orders=$(scripts/wp-orders.sh)
admin_page=$(curl -sL -b "$wp_jar" "$SHOP/wp-admin/admin.php?page=wc-orders")
if [ -n "$order_id" ] && grep -q "^$order_id .* cod " <<<"$wp_orders" && grep -q "#$order_id " <<<"$admin_page"; then
  pass "2  COD order #$order_id placed in the shop and listed in WP admin"
else
  fail "2  COD order in WP admin" "order id '$order_id'"
fi

# 4. member key: tools from all 3 servers, woo__list_orders, then a two-server flow
prefixes=$(mcp_list "$member_key" | json "' '.join(sorted({t['name'].split('__')[0] for t in d['tools']}))")
orders=$(mcp_call "$member_key" call woo__list_orders per_page=5 | json "'' if d.get('isError') else d['content'][0]['text']")
note=$(mcp_call "$member_key" call notes__add_note text="follow up on order $order_id" | json "'' if d.get('isError') else d['content'][0]['text']")
if [ "$prefixes" = "deepwiki notes woo" ] && grep -q "\"id\": $order_id" <<<"$orders" && grep -q "order $order_id" <<<"$note"; then
  pass "4  member key lists woo, notes, deepwiki tools; woo__list_orders then notes__add_note"
else
  fail "4  member MCP flow" "servers='$prefixes' order_seen=$(echo "$orders" | grep -c "\"id\": $order_id") note='${note:0:60}'"
fi

# 6a. revoked key gets 401 on the very next call
curl -s -b "$member_jar" -X DELETE "$APP/api/keys/$member_key_id" >/dev/null
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $member_key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"woo__list_orders","arguments":{}}}' "$APP/mcp")
if [ "$code" = "401" ]; then pass "6a revoked key -> 401 on next call"; else fail "6a revoked key" "got HTTP $code"; fi

# 6b. disabling notes removes its tools (chat uses the same tool list function)
member_key=$(post "$member_jar" /api/keys '{"label":"demo-check 2"}' | json "d['key']")
notes_id=$(server_id notes)
curl -s -b "$admin_jar" -X PATCH -H 'content-type: application/json' -d '{"enabled":false}' "$APP/api/servers/$notes_id" >/dev/null
without=$(mcp_list "$member_key" | json "len([t for t in d['tools'] if t['name'].startswith('notes__')])")
call=$(mcp_raw "$member_key" notes__list_notes | json "d['result']['content'][0]['text']")
curl -s -b "$admin_jar" -X PATCH -H 'content-type: application/json' -d '{"enabled":true}' "$APP/api/servers/$notes_id" >/dev/null
with=$(mcp_list "$member_key" | json "len([t for t in d['tools'] if t['name'].startswith('notes__')])")
if [ "$without" = "0" ] && [ "$with" = "3" ] && grep -q "disabled" <<<"$call"; then
  pass "6b disabling notes hides its tools and refuses calls; enabling brings them back"
else
  fail "6b disable notes" "tools while disabled=$without, after enable=$with, call='$call'"
fi

# 6c. notes-mcp scaled to 0: woo keeps working, notes shows unreachable within 30s
kubectl -n $NS scale deploy/notes-mcp --replicas=0 >/dev/null
start=$(date +%s)
status=""
while [ $(($(date +%s) - start)) -le 30 ]; do
  status=$(server_status notes)
  [ "$status" = "unreachable" ] && break
  sleep 1
done
took=$(($(date +%s) - start))
woo_ok=$(mcp_call "$member_key" call woo__list_products per_page=1 | json "not d.get('isError')")
notes_call=$(mcp_raw "$member_key" notes__list_notes | json "d['result'].get('isError', False)")
kubectl -n $NS scale deploy/notes-mcp --replicas=1 >/dev/null
if [ "$status" = "unreachable" ] && [ "$woo_ok" = "True" ] && [ "$notes_call" = "True" ]; then
  pass "6c notes-mcp at 0 replicas: unreachable after ${took}s, woo still answers"
else
  fail "6c notes down" "status=$status after ${took}s, woo_ok=$woo_ok, notes call is error=$notes_call"
fi

# 7. the audit log has all of the member's calls, including the denied one
audit=$(curl -s -b "$admin_jar" "$APP/api/audit?user=$member_id")
check=$(echo "$audit" | python3 -c "
import json,sys
rows = json.load(sys.stdin)['rows']
seen = {(r['serverSlug'], r['toolName'], r['outcome']) for r in rows if r['user'] == '$member_email'}
want = [('woo','list_orders','ok'), ('notes','add_note','ok'), ('woo','list_orders','denied'),
        ('notes','list_notes','denied'), ('notes','list_notes','upstream_error')]
print(' '.join('/'.join(w) for w in want if w not in seen))
")
own=$(curl -s -b "$member_jar" "$APP/api/audit?user=1" | json "len({r['user'] for r in d['rows']} - {'$member_email'})")
if [ -z "$check" ] && [ "$own" = "0" ]; then
  pass "7  audit log has the member's ok, denied and failed calls; member sees only their own rows"
else
  fail "7  audit log" "missing: $check, other users visible to member: $own"
fi

# leave notes running for whoever runs this next
kubectl -n $NS rollout status deploy/notes-mcp --timeout=60s >/dev/null 2>&1

echo
if [ $failures -eq 0 ]; then echo "all checks passed"; else echo "$failures check(s) failed"; fi
exit $failures
