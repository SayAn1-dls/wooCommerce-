import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
})

export const invites = pgTable('invites', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: integer('invited_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const apiKeys = pgTable(
  'api_keys',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    label: text('label').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_prefix_idx').on(t.prefix)],
)

export const servers = pgTable('servers', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  authType: text('auth_type', { enum: ['none', 'bearer', 'header'] }).notNull().default('none'),
  authHeaderName: text('auth_header_name'),
  authSecretEnc: text('auth_secret_enc'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    // null when a request came with a key we have never seen
    userId: integer('user_id').references(() => users.id),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id),
    source: text('source', { enum: ['mcp', 'chat'] }).notNull(),
    serverSlug: text('server_slug'),
    toolName: text('tool_name'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    outcome: text('outcome', { enum: ['ok', 'tool_error', 'upstream_error', 'timeout', 'denied'] }).notNull(),
    errorMessage: text('error_message'),
  },
  (t) => [index('audit_started_at_idx').on(t.startedAt), index('audit_user_id_idx').on(t.userId)],
)
