import { createHmac, randomBytes } from 'node:crypto'

// WooCommerce only allows key/secret basic auth over HTTPS. Inside the cluster
// we talk plain HTTP, so we sign requests with one-legged OAuth 1.0a instead.

// same as PHP rawurlencode, which WooCommerce uses to rebuild the signature
function enc(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export function sign(method: string, url: string, query: Record<string, string>, key: string, secret: string) {
  const params: Record<string, string> = {
    ...query,
    oauth_consumer_key: key,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const pairs = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
  const base = [method.toUpperCase(), enc(url), enc(pairs.join('&'))].join('&')
  params.oauth_signature = createHmac('sha256', secret + '&').update(base).digest('base64')
  return params
}
