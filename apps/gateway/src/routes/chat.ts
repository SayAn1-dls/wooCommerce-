import type { FastifyInstance } from 'fastify'
import { requireUser } from '../session.js'

export function chatRoutes(app: FastifyInstance) {
  app.post('/api/chat', { onRequest: requireUser }, async (_req, reply) => {
    return reply.code(501).send({ error: 'chat is not built yet' })
  })
}
