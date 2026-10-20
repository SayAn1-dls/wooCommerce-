// Records docs/media/demo.mp4 against the running local cluster (after scripts/dev-up.sh
// with ADMIN_EMAIL=asha@app.localhost ADMIN_NAME=Asha OLLAMA=1, and v2 images imported).
// Run: cd scripts/demo-video && node record.mjs   -> out/demo.mp4
import fs from 'node:fs'
import { start, scene, finish, sh, click, type, glide, terminal, code, linesOf, OUT, REPO } from './lib.mjs'

const APP = 'http://app.localhost'
const SHOP = 'http://shop.localhost'
const ASHA = OUT + 'asha.json'
const RAVI = OUT + 'ravi.json'
const ashaEmail = fs.readFileSync(`${REPO}/.dev-admin`, 'utf8').split('\n')[0]
const ashaPw = fs.readFileSync(`${REPO}/.dev-admin`, 'utf8').split('\n')[1]
const wpPw = sh(`kubectl -n mcpg get secret wordpress-auth -o jsonpath='{.data.admin-password}' | base64 -d`).trim()
const notesToken = sh(`kubectl -n mcpg get secret gateway-secrets -o jsonpath='{.data.NOTES_MCP_TOKEN}' | base64 -d`).trim()
const raviPw = 'ravi-demo-2026'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
let raviKey = ''
let raviKey2 = ''
let inviteLink = ''

const mcp = (key, rest) => `scripts/mcp.sh ${APP}/mcp ${key} ${rest} 2>/dev/null`
const toolNames = `python3 -c 'import json,sys; t=[x["name"] for x in json.load(sys.stdin)["tools"]]; print(len(t), "tools:"); [print("  "+n) for n in t]'`
const resultText = `python3 -c 'import json,sys; d=json.load(sys.stdin); print(("ERROR: " if d.get("isError") else "")+d["content"][0]["text"])'`

async function checkout(page, product) {
  await page.goto(`${SHOP}/product/${product}/`)
  await page.waitForTimeout(1200)
  await click(page, page.getByRole('button', { name: /add to cart/i }).first())
  await page.waitForTimeout(1800)
  await page.goto(`${SHOP}/checkout/`)
  await page.waitForSelector('#email')
  await page.waitForTimeout(800)
  await type(page, page.locator('#email'), 'buyer@example.com', 20)
  await glide(page, page.locator('#shipping-country'))
  await page.selectOption('#shipping-country', 'IN')
  await page.waitForTimeout(800)
  await type(page, page.locator('#shipping-first_name'), 'Meera', 30)
  await type(page, page.locator('#shipping-last_name'), 'Shah', 30)
  await type(page, page.locator('#shipping-address_1'), '12 MG Road', 20)
  await type(page, page.locator('#shipping-city'), 'Bengaluru', 20)
  await glide(page, page.locator('#shipping-state'))
  await page.selectOption('#shipping-state', 'KA')
  await type(page, page.locator('#shipping-postcode'), '560001', 30)
  await page.waitForTimeout(1200)
  const cod = page.locator('#radio-control-wc-payment-method-options-cod')
  await glide(page, cod)
  if (!(await cod.isChecked())) await cod.check({ force: true })
  await page.waitForTimeout(600)
  await click(page, page.getByRole('button', { name: 'Place Order' }))
  await page.waitForURL(/order-received/, { timeout: 60000 })
  await page.waitForTimeout(2500)
}

async function login(page, email, password) {
  await page.goto(APP)
  await page.waitForSelector('input[type=email]')
  await page.waitForTimeout(700)
  await type(page, page.locator('input[type=email]'), email, 30)
  await type(page, page.locator('input[type=password]'), password, 25)
  await click(page, page.getByRole('button', { name: 'Log in' }))
  await page.waitForSelector('.sidebar')
}

async function ask(page, question) {
  const input = page.getByPlaceholder(/Ask something/)
  await type(page, input, question, 30)
  await click(page, page.getByRole('button', { name: /Send/ }))
  await page.waitForSelector('.typing', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.typing', { state: 'detached', timeout: 180000 })
  await page.waitForTimeout(2500)
}

async function addServer(page, slug, name, url, token) {
  await click(page, page.getByRole('button', { name: 'Add server' }))
  await type(page, page.getByLabel(/^Slug/), slug, 40)
  await type(page, page.getByLabel('Name', { exact: true }), name, 30)
  await type(page, page.getByLabel(/^URL/), url, 15)
  if (token) {
    await glide(page, page.getByLabel('Credential'))
    await page.getByLabel('Credential').selectOption('bearer')
    await type(page, page.getByLabel('Secret'), token, 5)
  }
  await click(page, page.getByRole('button', { name: 'Save' }))
}

async function titlePage(page, heading, sub) {
  await page.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet"><style>
    body{margin:0;height:100vh;display:grid;place-items:center;font-family:Inter,-apple-system,sans-serif;color:#fff;
    background:radial-gradient(circle at 20% 20%,#6366f1 0,transparent 50%),radial-gradient(circle at 80% 80%,#a855f7 0,transparent 45%),#0f172a}
    .w{max-width:900px;padding:40px}h1{font-size:52px;line-height:1.1;margin:0 0 18px;letter-spacing:-.02em}p{font-size:22px;color:#cbd5e1;margin:0}
  </style></head><body><div class="w"><h1>${heading}</h1><p>${sub}</p></div></body></html>`)
  await page.waitForTimeout(800)
}

async function architecture(page) {
  await page.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>
    body{margin:0;background:#f5f6fb;font-family:Inter,-apple-system,sans-serif;color:#0f172a}
    h2{margin:22px 0 4px;text-align:center;font-size:26px}.sub{text-align:center;color:#64748b;margin-bottom:14px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:0 36px}
    .col{display:flex;flex-direction:column;gap:12px}
    .b{background:#fff;border:1px solid #e5e7ef;border-radius:12px;padding:12px 14px;box-shadow:0 4px 14px rgba(15,23,42,.06)}
    .b b{display:block;font-size:15px}.b span{color:#64748b;font-size:12.5px}
    .h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4f46e5;text-align:center}
    .acc{border-color:#a5b4fc;background:#eef2ff}.ext{border-style:dashed}
    .flow{margin:16px 36px 0;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:14px 18px;font:14px/1.7 "SF Mono",Menlo,monospace}
  </style></head><body>
  <h2>Architecture</h2><div class="sub">one Helm chart, namespace mcpg, k3d locally and k3s on a VPS</div>
  <div class="grid">
   <div class="col"><div class="h">Clients</div>
    <div class="b ext"><b>Claude Code / Cursor</b><span>one URL + personal API key</span></div>
    <div class="b ext"><b>Browser</b><span>dashboard and storefront</span></div>
    <div class="b"><b>Traefik ingress</b><span>shop.&lt;domain&gt;, app.&lt;domain&gt;</span></div></div>
   <div class="col"><div class="h">Gateway</div>
    <div class="b acc"><b>gateway (Fastify)</b><span>/api dashboard API, /mcp single MCP endpoint, /api/chat agent</span></div>
    <div class="b"><b>dashboard (React + nginx)</b><span>servers, members, keys, audit, chat</span></div>
    <div class="b"><b>Postgres</b><span>users, invites, keys, servers (encrypted creds), audit log</span></div></div>
   <div class="col"><div class="h">MCP upstreams</div>
    <div class="b acc"><b>woo-mcp</b><span>products and orders, internal only</span></div>
    <div class="b"><b>notes-mcp</b><span>tiny in-cluster server with a plain "search"</span></div>
    <div class="b ext"><b>DeepWiki</b><span>public remote server over Streamable HTTP</span></div></div>
   <div class="col"><div class="h">Store</div>
    <div class="b"><b>WordPress + WooCommerce</b><span>storefront, WP admin, REST API</span></div>
    <div class="b"><b>MariaDB</b><span>store database</span></div>
    <div class="b"><b>store-setup Job</b><span>WP-CLI, writes the woo-api Secret</span></div></div>
  </div>
  <div class="flow">client --Bearer mcpg_key--> Traefik --> gateway /mcp --stored credential--> woo-mcp --OAuth-signed REST--> WooCommerce</div>
  </body></html>`)
  await page.waitForTimeout(800)
}

await start()

await scene(
  's00-intro',
  'Urumi AI FDE, Round 1',
  `Hi. This is my Round 1 project for the Urumi A I, F D E internship: WooCommerce hosting with a team M C P gateway, on Kubernetes.
   An admin connects M C P servers once, in a dashboard. Every teammate then uses all of them through one M C P endpoint and one personal A P I key, or through a chat agent in the dashboard. Nobody except the gateway ever sees the upstream credentials.
   I will cover the architecture, run the full acceptance checklist with two users, Asha the admin and Ravi a member, tour Kubernetes, follow one tool call through the code, and finish with security, the chat agent, and local to V P S.`,
  {},
  (page) => titlePage(page, 'WooCommerce hosting with a team MCP gateway', 'One endpoint, one key per person, every MCP server the admin connected. Kubernetes, Helm, TypeScript.'),
)

await scene(
  's01-architecture',
  '1. Architecture',
  `There are four layers. The store: WordPress, WooCommerce and MariaDB. Woo M C P: our own M C P server that exposes products and orders as tools. It has no ingress, and only the gateway can reach it.
   The gateway: a Fastify backend that is an M C P client to every upstream, and an M C P server to everyone else, plus a React dashboard. And a chat agent inside the gateway, which calls tools through the same path as an external client.
   Notes M C P is a second upstream in the cluster, and DeepWiki is a public remote server. All of it is one Helm chart, in one namespace.`,
  {},
  (page) => architecture(page),
)

await scene(
  's02-store-order',
  '2. Checklist: buy with Cash on delivery',
  `Now the acceptance checklist, starting with the store at shop dot localhost. The sample products and their pictures were created by a Helm hook job with W P C L I.
   I add the cotton t-shirt to the cart, go to checkout, fill in an address, pick cash on delivery, and place the order.`,
  {},
  async (page) => {
    await page.goto(`${SHOP}/shop/`)
    await page.waitForTimeout(2500)
    await checkout(page, 'cotton-t-shirt')
  },
)

await scene(
  's03-wp-admin',
  '2. Checklist: the order in WooCommerce admin',
  `The order shows up straight away in WooCommerce admin, under orders, with cash on delivery and status processing.`,
  {},
  async (page) => {
    await page.goto(`${SHOP}/wp-login.php`)
    await type(page, page.locator('#user_login'), 'admin', 40)
    await type(page, page.locator('#user_pass'), wpPw, 10)
    await click(page, page.locator('#wp-submit'))
    await page.waitForTimeout(1500)
    await page.goto(`${SHOP}/wp-admin/admin.php?page=wc-orders`)
    await page.waitForTimeout(1500)
    await glide(page, page.locator('a.order-view').first())
    await page.waitForTimeout(1500)
  },
)

await scene(
  's04-asha-servers',
  '2. Checklist: Asha (admin) sees 3 servers',
  `Now the dashboard at app dot localhost. Asha is the admin. Her account was seeded on first boot from a Kubernetes secret.
   She sees all three servers connected: WooCommerce, team notes and DeepWiki, with their tool counts. Opening WooCommerce shows its five tools.
   Every tool is exposed with the server slug as a prefix, like woo, double underscore, list orders, so names never change when servers are added.`,
  {},
  async (page, ctx) => {
    await login(page, ashaEmail, ashaPw)
    await page.waitForTimeout(3500)
    await ctx.storageState({ path: ASHA })
    await click(page, page.locator('.server-card', { hasText: 'WooCommerce' }).getByRole('link', { name: 'View tools' }))
    await page.waitForTimeout(2500)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(2500)
  },
)

await scene(
  's05-chat-test-mug',
  '2. Checklist: chat creates "Test Mug"',
  `As Asha, I ask the chat agent to create a product called Test Mug, priced at two hundred and ninety nine. The agent calls woo create product through the gateway. The line under the answer lists each tool call and how long it took. And here it is on the storefront.`,
  { state: ASHA },
  async (page) => {
    await page.goto(`${APP}/chat`)
    await page.waitForTimeout(1200)
    await ask(page, 'Create a product called "Test Mug" priced at 299')
    await page.waitForTimeout(1500)
    await page.goto(`${SHOP}/shop/`)
    await page.waitForTimeout(1500)
    await glide(page, page.getByText('Test Mug').first())
    await page.waitForTimeout(1500)
  },
)

await scene(
  's06-order-test-mug',
  '2. Checklist: order Test Mug by hand',
  `Now I order the Test Mug by hand on the storefront, again with cash on delivery.`,
  {},
  (page) => checkout(page, 'test-mug'),
)

await scene(
  's07-chat-today',
  '2. Checklist: "what orders came in today?"',
  `Back in the chat, I ask: what orders came in today? The agent knows today's date and the store timezone from its system prompt. It calls list orders with after set to midnight, and lists today's orders, including the Test Mug I just bought.`,
  { state: ASHA },
  async (page) => {
    await page.goto(`${APP}/chat`)
    await page.waitForTimeout(1200)
    await ask(page, 'What orders came in today?')
  },
)

await scene(
  's08-invite-ravi',
  '2. Checklist: Asha invites Ravi',
  `Next, the team. Asha invites Ravi as a member. There is no email sending. The dashboard returns a one time link that expires in seventy two hours, and Asha sends it to Ravi herself.`,
  { state: ASHA },
  async (page) => {
    await page.goto(`${APP}/members`)
    await page.waitForTimeout(1200)
    await type(page, page.getByPlaceholder('teammate@company.com'), 'ravi@example.com', 40)
    await click(page, page.getByRole('button', { name: 'Create invite link' }))
    await page.waitForSelector('.secret-box code')
    inviteLink = (await page.locator('.secret-box code').textContent()).trim()
    await glide(page, page.locator('.secret-box'))
    await page.waitForTimeout(1500)
  },
)

await scene(
  's09-ravi-joins',
  '2. Checklist: Ravi (member) joins and creates a key',
  `Ravi opens the link, picks his name and a password, and lands on his keys page. He creates a key called laptop. The full key is shown exactly once. The gateway stores only a hash and a short prefix. The page also shows the Claude Code command to connect.`,
  {},
  async (page, ctx) => {
    await page.goto(inviteLink)
    await page.waitForSelector('input[type=password]')
    await page.waitForTimeout(1000)
    await type(page, page.getByPlaceholder('Ravi Kumar'), 'Ravi', 60)
    await type(page, page.locator('input[type=password]'), raviPw, 30)
    await click(page, page.getByRole('button', { name: 'Create account' }))
    await page.waitForSelector('text=My keys')
    await ctx.storageState({ path: RAVI })
    await page.waitForTimeout(1200)
    await type(page, page.getByPlaceholder('label, e.g. laptop'), 'laptop', 50)
    await click(page, page.getByRole('button', { name: 'Create', exact: true }))
    await page.waitForSelector('.secret-box code')
    raviKey = (await page.locator('.secret-box code').textContent()).trim()
    await glide(page, page.locator('pre'))
    await page.waitForTimeout(2000)
  },
)

await scene(
  's10-ravi-client',
  '2. Checklist: Ravi\'s MCP client, one URL + one key',
  `Ravi connects an M C P client with only the gateway U R L and his key. Here I use the M C P Inspector command line; Claude Code works the same way with the command shown on his keys page.
   Listing tools returns eleven tools from all three servers. Asking for today's orders works.
   And one flow uses two servers: it lists today's orders, then saves a note summarising them, with notes add note.`,
  {},
  (page) =>
    terminal(page, 'ravi@laptop: MCP Inspector CLI -> http://app.localhost/mcp', [
      { note: 'Claude Code: claude mcp add --transport http team-gateway http://app.localhost/mcp --header "Authorization: Bearer $RAVI_KEY"' },
      { cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY list`, run: `${mcp(raviKey, 'list')} | ${toolNames}` },
      {
        cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY call woo__list_orders after=${today}T00:00:00`,
        run: `${mcp(raviKey, `call woo__list_orders after=${today}T00:00:00`)} | ${resultText} | python3 -c 'import json,sys; [print(f"order #{o[\"id\"]}  {o[\"status\"]}  {o[\"total\"]} {o[\"currency\"]}  {o[\"customer\"]}  {\", \".join(i[\"name\"] for i in o[\"line_items\"])}") for o in json.load(sys.stdin)]'`,
      },
      {
        cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY call notes__add_note text="Today: 2 COD orders, Cotton T-Shirt and Test Mug"`,
        run: `${mcp(raviKey, `call notes__add_note text="Today: 2 COD orders, Cotton T-Shirt and Test Mug"`)} | ${resultText}`,
        pause: 2500,
      },
    ]),
)

await scene(
  's11-revoke',
  '2. Checklist: Asha revokes Ravi\'s key',
  `Now control. Asha opens A P I keys, which lists everyone's keys, and revokes Ravi's laptop key.`,
  { state: ASHA },
  async (page) => {
    await page.goto(`${APP}/keys`)
    await page.waitForTimeout(1500)
    await click(page, page.locator('tr', { hasText: 'laptop' }).getByRole('button', { name: 'Revoke' }))
    await page.waitForTimeout(2000)
  },
)

await scene(
  's12-401',
  '2. Checklist: revoked key -> 401',
  `Ravi's very next call is rejected with H T T P 401. Keys are checked against the database on every request, with no cache, so a revoke works instantly.`,
  {},
  (page) =>
    terminal(page, 'ravi@laptop', [
      {
        cmd: `curl -s -w '  HTTP %{http_code}\\n' -X POST ${APP}/mcp -H "Authorization: Bearer $RAVI_KEY" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        run: `curl -s -w '  HTTP %{http_code}\\n' -X POST ${APP}/mcp -H "Authorization: Bearer ${raviKey}" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        pause: 2500,
      },
    ]),
)

await scene(
  's13-disable-notes',
  '2. Checklist: issue a key, disable notes',
  `An admin can also issue a key for anyone, so Asha issues a new one for Ravi to keep going. Then she disables the team notes server.`,
  { state: ASHA },
  async (page) => {
    await page.goto(`${APP}/keys`)
    await page.waitForTimeout(1200)
    await type(page, page.getByPlaceholder('label, e.g. laptop'), 'issued by Asha', 30)
    await glide(page, page.locator('select'))
    await page.locator('select').selectOption({ label: 'for ravi@example.com' })
    await click(page, page.getByRole('button', { name: 'Create', exact: true }))
    await page.waitForSelector('.secret-box code')
    raviKey2 = (await page.locator('.secret-box code').textContent()).trim()
    await page.waitForTimeout(1500)
    await page.goto(APP)
    await page.waitForTimeout(1500)
    await click(page, page.locator('.server-card', { hasText: 'Team notes' }).getByRole('button', { name: 'Disable' }))
    await page.waitForTimeout(2500)
  },
)

await scene(
  's14-notes-gone',
  '2. Checklist: notes tools disappear',
  `Ravi's tool list drops to eight: the notes tools are gone, and a direct call says notes is disabled. The chat agent builds its tool list with the very same function, so the notes tools disappear from the chat too.`,
  {},
  (page) =>
    terminal(page, 'ravi@laptop', [
      { cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY list`, run: `${mcp(raviKey2, 'list')} | ${toolNames}` },
      {
        cmd: `curl -s -X POST ${APP}/mcp -H "Authorization: Bearer $RAVI_KEY" ... tools/call notes__list_notes`,
        run: `curl -s -X POST ${APP}/mcp -H "Authorization: Bearer ${raviKey2}" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"notes__list_notes","arguments":{}}}'`,
        pause: 2000,
      },
    ]),
)

await scene(
  's15-kill-notes',
  '2. Checklist: kill notes-mcp',
  `Asha enables notes again. Now I kill notes M C P by scaling its deployment to zero. The gateway pings every upstream every fifteen seconds, checks again five seconds after a failure, and two failures in a row mark it unreachable. Watch the team notes card.`,
  { state: ASHA },
  async (page) => {
    await page.goto(APP)
    await page.waitForTimeout(1200)
    await click(page, page.locator('.server-card', { hasText: 'Team notes' }).getByRole('button', { name: 'Enable' }))
    await page.locator('.server-card', { hasText: 'Team notes' }).getByText('Connected').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    sh('kubectl -n mcpg scale deploy/notes-mcp --replicas=0')
    await page.locator('.server-card', { hasText: 'Team notes' }).getByText('Unreachable').waitFor({ timeout: 60000 })
    await glide(page, page.locator('.server-card', { hasText: 'Team notes' }))
    await page.waitForTimeout(3000)
  },
)

await scene(
  's16-others-work',
  '2. Checklist: woo and DeepWiki keep working',
  `WooCommerce and the remote DeepWiki server keep working, and a notes call returns a clear error instead of hanging. Then I scale notes back to one, and the gateway reconnects on its own.`,
  {},
  (page) =>
    terminal(page, 'ravi@laptop', [
      { cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY call woo__list_products per_page=3`, run: `${mcp(raviKey2, 'call woo__list_products per_page=3')} | ${resultText}`, max: 16 },
      {
        cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY call deepwiki__read_wiki_structure repoName=modelcontextprotocol/typescript-sdk`,
        run: `${mcp(raviKey2, 'call deepwiki__read_wiki_structure repoName=modelcontextprotocol/typescript-sdk')} | ${resultText}`,
        max: 10,
      },
      {
        cmd: `curl -s -X POST ${APP}/mcp -H "Authorization: Bearer $RAVI_KEY" ... tools/call notes__list_notes`,
        run: `curl -s -X POST ${APP}/mcp -H "Authorization: Bearer ${raviKey2}" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"notes__list_notes","arguments":{}}}'`,
      },
      { cmd: 'kubectl -n mcpg scale deploy/notes-mcp --replicas=1', pause: 1500 },
    ]),
)

await scene(
  's17-audit',
  '2. Checklist: everything is in the audit log',
  `Every one of these calls is in the audit log, under the right user. Filtering by Ravi shows his successful calls, the denied call with the revoked key, and the failed notes calls. Members only ever see their own rows, and tool arguments are never stored.`,
  { state: ASHA },
  async (page) => {
    await page.goto(`${APP}/audit`)
    await page.waitForTimeout(1500)
    await glide(page, page.locator('select').first())
    await page.locator('select').first().selectOption({ label: 'ravi@example.com' })
    await page.waitForTimeout(2500)
    await page.mouse.wheel(0, 250)
    await page.waitForTimeout(2500)
  },
)

await scene(
  's18-k8s',
  '3. Kubernetes tour',
  `Now a tour of Kubernetes. Everything lives in the M C P G namespace: stateful sets for MariaDB and Postgres, deployments for WordPress, the two M C P servers, the gateway and the dashboard, the store setup job, volume claims, generated secrets, three ingresses, and the network policies.
   Every workload has requests, limits and health probes. The policies start from default deny. From inside the dashboard pod, curl to woo M C P is blocked. k3s rejects the connection outright, so it fails at once instead of timing out.`,
  {},
  (page) =>
    terminal(page, 'kubectl', [
      { cmd: 'kubectl get all,pvc,secret,ingress,networkpolicy -n mcpg', lineDelay: 30, max: 60, pause: 1500 },
      {
        cmd: 'kubectl -n mcpg get deploy -o custom-columns=NAME:.metadata.name,CPU_REQ:..requests.cpu,MEM_LIMIT:..limits.memory,READY_PROBE:..readinessProbe.httpGet.path',
        run: "kubectl -n mcpg get deploy -o custom-columns='NAME:.metadata.name,CPU_REQ:.spec.template.spec.containers[0].resources.requests.cpu,MEM_LIMIT:.spec.template.spec.containers[0].resources.limits.memory,READY_PROBE:.spec.template.spec.containers[0].readinessProbe.httpGet.path'",
      },
      { cmd: 'kubectl -n mcpg exec deploy/dashboard -- curl -s -m 5 http://woo-mcp:3000/mcp; echo "exit $?"', pause: 2500 },
    ]),
)

{
  const [a] = linesOf('apps/gateway/src/mcp.ts', "app.post('/mcp'", 1)
  await scene(
    's19-trace-mcp',
    '4. MCP internals: one call, step 1',
    `Let's follow one woo list orders call. The client posts JSON R P C to slash M C P. The gateway checks the A P I key against the database, then builds a fresh M C P server for this one request, bound to that user. Nothing about the client lives in memory, so the endpoint is stateless and can scale out later.`,
    {},
    (page) => code(page, 'apps/gateway/src/mcp.ts', a, a + 34, [[a + 3, a + 6], [a + 25, a + 30]]),
  )
}
{
  const [a] = linesOf('apps/gateway/src/tools.ts', 'export async function callTool', 1)
  await scene(
    's20-trace-calltool',
    '4. MCP internals: one call, step 2',
    `call tool splits the name on the first double underscore to find the server, checks that it is enabled and connected, and forwards the call with a twenty second timeout. Whatever happens, it writes exactly one audit row. Failures come back as a normal tool result with is error set, never as a hang.`,
    {},
    (page) => code(page, 'apps/gateway/src/tools.ts', a, a + 30, [[a + 3, a + 5], [a + 13, a + 20]]),
  )
}
{
  const [a] = linesOf('apps/gateway/src/upstreams.ts', 'function fetchFor', 1)
  await scene(
    's21-trace-fetch',
    '4. MCP internals: one call, step 3',
    `The request to the upstream is built here. The client's authorization header is deleted, the server's own stored credential is decrypted at this moment and added, and redirects are refused. So upstreams never see user keys. Woo M C P then signs its WooCommerce REST call, and the result travels back the same way.`,
    {},
    (page) => code(page, 'apps/gateway/src/upstreams.ts', a - 2, a + 16, [[a + 1, a + 9]]),
  )
}

await scene(
  's22-collision',
  '4. MCP internals: a name collision',
  `Name collisions. Notes M C P has a tool called plain search, on purpose. Asha adds a second notes server with the slug team2. Both search tools now live side by side, as notes search and team2 search, because every tool is always prefixed.`,
  { state: ASHA },
  async (page) => {
    await page.goto(APP)
    await page.waitForTimeout(1000)
    await addServer(page, 'team2', 'Second notes', 'http://notes-mcp:3000/mcp', notesToken)
    await page.locator('.server-card', { hasText: 'team2' }).waitFor({ timeout: 30000 })
    await page.waitForTimeout(2000)
    await terminal(page, 'ravi@laptop', [
      { cmd: `scripts/mcp.sh ${APP}/mcp $RAVI_KEY list | grep search`, run: `${mcp(raviKey2, 'list')} | ${toolNames} | grep search`, pause: 2500 },
    ])
  },
)

await scene(
  's23-timeout',
  '4. MCP internals: a timeout',
  `A timeout. This server points at an address that never answers. The connect attempt times out, and the server is marked unreachable, with the reason. Its tools never appear, and every other server is unaffected. Calls to a connected server have their own twenty second timeout. The dead upstream case, we already saw with notes. Asha then removes the test servers.`,
  { state: ASHA },
  async (page) => {
    await page.goto(APP)
    await page.waitForTimeout(1000)
    await addServer(page, 'slow', 'Never answers', 'https://192.0.2.1/mcp')
    // the status poll can show the card before the first connect attempt has finished
    const card = page.locator('.server-card', { hasText: 'slow' })
    await card.locator('.error').filter({ hasNotText: 'not checked yet' }).waitFor({ timeout: 60000 })
    await glide(page, card.locator('.name'))
    await page.waitForTimeout(3500)
    for (const name of ['slow', 'team2']) {
      await click(page, page.locator('.server-card', { hasText: name }).getByRole('button', { name: 'Remove' }))
      await page.waitForTimeout(1500)
    }
  },
)

await scene(
  's24-security-db',
  '5. Security: what is stored, what members can\'t do',
  `Security. A P I keys are stored only as a SHA 256 hash plus a short prefix. Upstream credentials are encrypted with A E S 256 G C M, using a key from a Kubernetes secret, and the A P I only ever says whether one is set. And Ravi, as a member, gets 403 on admin routes. Role checks run on the server before the request body is even parsed.`,
  {},
  (page) =>
    terminal(page, 'kubectl exec postgres-0 -- psql', [
      { cmd: `psql -c "select id, user_id, label, prefix, left(key_hash, 24) as key_hash, revoked_at is not null as revoked from api_keys"`, run: `kubectl -n mcpg exec postgres-0 -- psql -U mcpg -c "select id, user_id, label, prefix, left(key_hash, 24) as key_hash, revoked_at is not null as revoked from api_keys"` },
      { cmd: `psql -c "select slug, auth_type, left(auth_secret_enc, 44) as auth_secret_enc from servers"`, run: `kubectl -n mcpg exec postgres-0 -- psql -U mcpg -c "select slug, auth_type, left(auth_secret_enc, 44) as auth_secret_enc from servers"` },
      {
        cmd: `curl -s -w '  HTTP %{http_code}' -b ravi-session -X POST ${APP}/api/servers -d '{"slug":"evil",...}'`,
        run: `J=$(mktemp); curl -s -c $J -o /dev/null -H 'content-type: application/json' -d '{"email":"ravi@example.com","password":"${raviPw}"}' ${APP}/api/auth/login; curl -s -w '  HTTP %{http_code}' -b $J -X POST -H 'content-type: application/json' -d '{"slug":"evil","name":"x","url":"https://example.com/mcp"}' ${APP}/api/servers; rm -f $J`,
        pause: 2500,
      },
    ]),
)

await scene(
  's25-ssrf',
  '5. Security: a malicious server URL',
  `What if an admin adds a malicious server, like the cloud metadata address? The S S R F guard resolves the host and refuses private, loopback and link local ranges. And even past that, the gateway's network policy only lets it reach port 443 on public addresses.`,
  { state: ASHA },
  async (page) => {
    await page.goto(APP)
    await page.waitForTimeout(1000)
    await addServer(page, 'meta', 'Metadata', 'http://169.254.169.254/latest/meta-data')
    await page.locator('.alert').waitFor()
    await glide(page, page.locator('.alert'))
    await page.waitForTimeout(3000)
  },
)

{
  const [a] = linesOf('apps/gateway/src/chat.ts', 'export async function runChat', 1)
  await scene(
    's26-chat-loop',
    '6. The chat agent tool loop',
    `The chat agent lives in the gateway. It gets the user's tools with the same list tools function as the M C P endpoint, sends them to any OpenAI compatible model, here a local Ollama, and runs requested tools through the same call tool path, with source set to chat. Each result is capped at fifty kilobytes, and it stops after eight tool calls. Because every call goes through call tool as the logged in user, each chat tool call is audited under that user's id, so the agent can never do more than the user could.`,
    {},
    (page) => code(page, 'apps/gateway/src/chat.ts', a, a + 33, [[a + 6, a + 10], [a + 31, a + 33]]),
  )
}

// helm upgrade and rollback take a minute each; run them now and show their real output in the scene
const upgradeOut = sh(
  'helm upgrade platform charts/platform -n mcpg -f charts/platform/values-local.yaml -f charts/platform/values-local-ollama.yaml --set images.tag=v2 --wait --timeout 10m 2>&1 | grep -vE "^(NOTES|$)"',
)
const afterUpgrade = sh(`kubectl -n mcpg get deploy gateway -o jsonpath='{.spec.template.spec.containers[0].image}{"\\n"}'`)
const historyOut = sh('helm history platform -n mcpg')
const rollbackOut = sh('helm rollback platform 1 -n mcpg --wait --timeout 10m 2>&1 | grep -v "^- "')
const afterRollback = sh(`kubectl -n mcpg get deploy gateway -o jsonpath='{.spec.template.spec.containers[0].image}{"\\n"}'`)
sh('kubectl -n mcpg rollout status deploy/gateway --timeout=120s')

await scene(
  's27-vps',
  '7. Local to VPS, upgrade and rollback',
  `Finally, local to V P S. It is the same chart everywhere. Only the values file changes: the domain, T L S through cert manager, and images from GitHub's container registry with version tags. Values prod renders cleanly.
   An upgrade to a new image tag rolls out with helm upgrade, and helm rollback goes back. Volumes and secrets are kept, and schema changes are additive only, so users, keys and the store survive both.`,
  {},
  (page) =>
    terminal(page, 'helm', [
      { cmd: 'diff charts/platform/values-local.yaml charts/platform/values-prod.yaml', max: 30 },
      { cmd: 'helm template platform charts/platform -f charts/platform/values-prod.yaml | grep -B1 -A3 "tls:"', max: 14 },
      { cmd: 'helm upgrade platform charts/platform -n mcpg -f values-local.yaml --set images.tag=v2 --wait', out: upgradeOut + afterUpgrade, max: 12 },
      { cmd: 'helm history platform -n mcpg', out: historyOut },
      { cmd: 'helm rollback platform 1 -n mcpg --wait', out: rollbackOut + afterRollback, pause: 2000 },
    ]),
)

await scene(
  's28-outro',
  'Thanks for watching',
  `That is the whole platform. The repo has the README with local and V P S setup, design notes, a threat model, and a demo check script that runs this definition of done from the terminal in about thirty seconds. Thanks for watching.`,
  {},
  (page) => titlePage(page, 'Thanks for watching', 'github.com/SayAn1-dls/wooCommerce-  |  scripts/dev-up.sh  |  scripts/demo-check.sh'),
)

await finish()
