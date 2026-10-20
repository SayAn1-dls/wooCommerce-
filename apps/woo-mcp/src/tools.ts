import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { woo } from './woo.js'

const tz = process.env.STORE_TIMEZONE || 'UTC'
const statuses = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'] as const
// a refine instead of z.iso.datetime keeps the JSON schema a plain string;
// the huge regex that z.iso emits trips up some LLM tool parsers
const dateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date-time')

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

// every tool goes through here so a Woo failure becomes a short isError result, not a crash
async function run(fn: () => Promise<unknown>) {
  try {
    return text(await fn())
  } catch (err) {
    return { isError: true, content: [{ type: 'text' as const, text: (err as Error).message }] }
  }
}

function shortOrder(o: any) {
  return {
    id: o.id,
    date: o.date_created,
    status: o.status,
    total: o.total,
    currency: o.currency,
    customer: `${o.billing?.first_name ?? ''} ${o.billing?.last_name ?? ''}`.trim(),
    line_items: (o.line_items ?? []).map((i: any) => ({ name: i.name, quantity: i.quantity, total: i.total })),
  }
}

export function addTools(server: McpServer) {
  server.registerTool(
    'list_products',
    {
      description: 'List products in the store. Returns id, name, price, stock and status.',
      inputSchema: {
        search: z.string().optional().describe('Text to search for in product names'),
        page: z.number().int().min(1).optional(),
        per_page: z.number().int().min(1).max(50).optional().describe('Default 20, max 50'),
      },
    },
    ({ search, page, per_page }) =>
      run(async () => {
        const list = await woo('GET', '/products', { query: { search, page, per_page: per_page ?? 20 } })
        return list.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          stock: p.manage_stock ? p.stock_quantity : p.stock_status,
          status: p.status,
        }))
      }),
  )

  server.registerTool(
    'create_product',
    {
      description: 'Create a published simple product. Returns its id and permalink.',
      inputSchema: {
        name: z.string().min(1),
        regular_price: z.coerce.string().describe('Price in the store currency, e.g. "299"'),
        description: z.string().optional(),
        stock_quantity: z.number().int().min(0).optional(),
      },
    },
    ({ name, regular_price, description, stock_quantity }) =>
      run(async () => {
        const p = await woo('POST', '/products', {
          body: {
            name,
            type: 'simple',
            status: 'publish',
            regular_price: String(regular_price),
            description: description ?? '',
            manage_stock: stock_quantity !== undefined,
            stock_quantity,
          },
        })
        return { id: p.id, name: p.name, price: p.price, permalink: p.permalink }
      }),
  )

  server.registerTool(
    'list_orders',
    {
      description:
        `List orders, newest first. Dates are in the store timezone (${tz}). ` +
        `"Today" means after = midnight today in ${tz}, written without a timezone suffix, ` +
        `e.g. after="2026-01-31T00:00:00". Returns id, date, status, total, customer name and line items.`,
      inputSchema: {
        after: dateTime.optional().describe(`Only orders created after this time (store timezone ${tz})`),
        before: dateTime.optional().describe(`Only orders created before this time (store timezone ${tz})`),
        status: z.enum(statuses).optional(),
        per_page: z.number().int().min(1).max(50).optional().describe('Default 20, max 50'),
      },
    },
    ({ after, before, status, per_page }) =>
      run(async () => {
        const list = await woo('GET', '/orders', { query: { after, before, status, per_page: per_page ?? 20 } })
        return list.map(shortOrder)
      }),
  )

  server.registerTool(
    'get_order',
    {
      description: 'Get one order with all its details.',
      inputSchema: { order_id: z.number().int().min(1) },
    },
    ({ order_id }) =>
      run(async () => {
        const { _links, ...order } = await woo('GET', `/orders/${order_id}`)
        return order
      }),
  )

  server.registerTool(
    'update_order_status',
    {
      description: 'Change the status of an order. Returns the updated order.',
      inputSchema: { order_id: z.number().int().min(1), status: z.enum(statuses) },
    },
    ({ order_id, status }) =>
      run(async () => shortOrder(await woo('PUT', `/orders/${order_id}`, { body: { status } }))),
  )
}
