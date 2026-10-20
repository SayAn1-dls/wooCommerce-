function need(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export const config = {
  port: Number(process.env.PORT || 3000),
  sessionSecret: need('SESSION_SECRET'),
  encKey: need('GATEWAY_ENC_KEY'),
  // tokens the gateway uses to call our own upstreams (only needed for seeding)
  wooToken: process.env.WOO_MCP_TOKEN || '',
  notesToken: process.env.NOTES_MCP_TOKEN || '',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || '',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || '',
  remote: {
    slug: process.env.REMOTE_SERVER_SLUG || 'deepwiki',
    name: process.env.REMOTE_SERVER_NAME || 'DeepWiki',
    url: process.env.REMOTE_SERVER_URL || 'https://mcp.deepwiki.com/mcp',
  },
  allowedInternalHosts: (process.env.ALLOWED_INTERNAL_HOSTS || 'woo-mcp,notes-mcp')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
  storeTimezone: process.env.STORE_TIMEZONE || 'UTC',
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || '',
    apiKey: process.env.LLM_API_KEY || '',
  },
  secureCookies: process.env.SECURE_COOKIES === 'true',
}
