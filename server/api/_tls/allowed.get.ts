import { createError, defineEventHandler } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import { resolveTlsDomain } from '../../utils/tenant-host'
import { findTenantSchool } from '../../utils/tenant'
import { validateQuery } from '../../utils/validation'

const querySchema = z.object({ domain: z.string().min(1).max(253) })

/**
 * Caddy's on-demand TLS `ask` endpoint (deploy/Caddyfile): 200 lets it issue a certificate for the domain,
 * anything else refuses. Only the bare domain, www and existing schools (any status) are allowed, so nobody
 * can make us request certificates for made-up names. Caddy blocks this path from the outside.
 */
export default defineEventHandler(async (event) => {
  const { domain } = validateQuery(event, querySchema)
  const result = resolveTlsDomain(domain, useRuntimeConfig(event).appDomain)
  const allowed = result?.kind === 'apex' || (result?.kind === 'school' && !!await findTenantSchool(result.slug))
  if (!allowed) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  return { ok: true }
})
