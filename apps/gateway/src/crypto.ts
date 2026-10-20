import { argon2, createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { config } from './config.js'

const argon = promisify(argon2)
// GATEWAY_ENC_KEY is a random string from the Secret; hash it to get exactly 32 bytes
const encKey = createHash('sha256').update(config.encKey).digest()

export function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex')
}

export function sameHex(a: string, b: string) {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && timingSafeEqual(x, y)
}

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function base62(bytes: Buffer) {
  let n = BigInt('0x' + bytes.toString('hex'))
  let out = ''
  while (n > 0n) {
    out = alphabet[Number(n % 62n)] + out
    n /= 62n
  }
  return out
}

export function randomToken() {
  return base62(randomBytes(32))
}

// AES-256-GCM, stored as iv.tag.ciphertext in base64
export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decrypt(stored: string) {
  const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', encKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

const argonParams = { parallelism: 1, tagLength: 32, memory: 19456, passes: 2 }

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await argon('argon2id', { message: password, nonce: salt, ...argonParams })
  return `argon2id$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function checkPassword(password: string, stored: string) {
  const [algo, salt, hash] = stored.split('$')
  if (algo !== 'argon2id' || !salt || !hash) return false
  const got = await argon('argon2id', { message: password, nonce: Buffer.from(salt, 'base64'), ...argonParams })
  const want = Buffer.from(hash, 'base64')
  return got.length === want.length && timingSafeEqual(got, want)
}
