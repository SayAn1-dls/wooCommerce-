import type { FastifyInstance } from 'fastify'
import { requireUser } from '../session.js'
import { ChatError, runChat } from '../chat.js'

export function chatRoutes(app: FastifyInstance) {
  app.post(
    '/api/chat',
    {
      onRequest: requireUser,
      schema: {
        body: {
          type: 'object',
          required: ['messages'],
          properties: {
            // only user and assistant turns: the client never gets to write a system or tool message
            messages: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                required: ['role', 'content'],
                additionalProperties: false,
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string', maxLength: 8000 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { messages } = req.body as { messages: { role: 'user' | 'assistant'; content: string }[] }
      try {
        return await runChat(req.user!.id, messages)
      } catch (err) {
        if (err instanceof ChatError) return reply.code(503).send({ error: err.message })
        req.log.error(err)
        return reply.code(500).send({ error: 'chat failed, see gateway logs' })
      }
    },
  )
}
