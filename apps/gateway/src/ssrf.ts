import { lookup } from 'node:dns/promises'
import net from 'node:net'

// Admins type in upstream URLs, and the gateway then makes requests to them from
// inside the cluster. Without this check a URL could point at the cloud metadata
// service, the Kubernetes API or postgres.
const blocked = new net.BlockList()
blocked.addSubnet('0.0.0.0', 8)
blocked.addSubnet('10.0.0.0', 8)
blocked.addSubnet('100.64.0.0', 10)
blocked.addSubnet('127.0.0.0', 8)
blocked.addSubnet('169.254.0.0', 16)
blocked.addSubnet('172.16.0.0', 12)
blocked.addSubnet('192.168.0.0', 16)
blocked.addSubnet('::', 128, 'ipv6')
blocked.addSubnet('::1', 128, 'ipv6')
blocked.addSubnet('fc00::', 7, 'ipv6')
blocked.addSubnet('fe80::', 10, 'ipv6')

function isBlocked(address: string) {
  // ::ffff:10.0.0.1 is just 10.0.0.1 in disguise
  const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4) return blocked.check(v4[1], 'ipv4')
  return blocked.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4')
}

export async function checkUrl(raw: string, allowedHosts: string[]) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http and https URLs are allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (allowedHosts.includes(host)) return url

  let addresses: string[]
  if (net.isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address)
    } catch {
      throw new Error(`could not resolve ${host}`)
    }
  }
  for (const a of addresses) {
    if (isBlocked(a)) throw new Error(`${host} points to a private or internal address (${a})`)
  }
  return url
}
