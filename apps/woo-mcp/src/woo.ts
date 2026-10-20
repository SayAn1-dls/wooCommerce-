import http from 'node:http'
import { readFileSync } from 'node:fs'
import { sign } from './oauth.js'

const internal = new URL(process.env.WOO_URL || 'http://wordpress')
const publicUrl = new URL(process.env.WOO_PUBLIC_URL || 'http://shop.localhost')
const sendPublicHost = process.env.WOO_SEND_PUBLIC_HOST !== 'false'
const credDir = process.env.WOO_CREDENTIALS_DIR || '/etc/woo-api'

type Query = Record<string, string | number | undefined>

// Read on every call. The store-setup Job fills the Secret after this pod may
// already be running, and the mounted file updates without a restart.
function credentials() {
  let key = process.env.WOO_CONSUMER_KEY || ''
  let secret = process.env.WOO_CONSUMER_SECRET || ''
  try {
    key = readFileSync(`${credDir}/consumer_key`, 'utf8').trim() || key
    secret = readFileSync(`${credDir}/consumer_secret`, 'utf8').trim() || secret
  } catch {
    // no mounted secret, fall back to env (local runs)
  }
  if (!key || !secret) throw new Error('WooCommerce API key is not set yet (woo-api Secret is empty)')
  return { key, secret }
}

function request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string | number> = { accept: 'application/json' }
  // WordPress builds links and redirects from the Host header, so pretend to be the public site
  if (sendPublicHost) headers.host = publicUrl.host
  if (payload) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = Buffer.byteLength(payload)
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: internal.hostname, port: internal.port || 80, method, path, headers, timeout: 15000 },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => {
          let data: any = null
          try {
            data = JSON.parse(text)
          } catch {
            // not JSON, handled by the caller through status
          }
          resolve({ status: res.statusCode || 0, data })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('WooCommerce did not answer within 15s')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

export async function woo(method: string, path: string, opts: { query?: Query; body?: unknown } = {}) {
  const { key, secret } = credentials()
  const fullPath = `/wp-json/wc/v3${path}`
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== '') query[k] = String(v)
  }
  // WooCommerce checks the signature against its own home URL, with http for non-TLS requests
  const signed = sign(method, `http://${publicUrl.host}${fullPath}`, query, key, secret)
  const qs = new URLSearchParams(signed).toString()

  let res
  try {
    res = await request(method, `${fullPath}?${qs}`, opts.body)
  } catch (err) {
    throw new Error(`could not reach WooCommerce: ${(err as Error).message}`)
  }
  if (res.status >= 200 && res.status < 300 && res.data !== null) return res.data
  const msg = res.data?.message ? `: ${res.data.message}` : ''
  throw new Error(`WooCommerce returned HTTP ${res.status}${msg}`)
}

// readiness: is WordPress up with the WooCommerce REST routes loaded (no key needed)
export async function ping() {
  const res = await request('GET', '/wp-json/wc/v3')
  return res.status === 200
}
