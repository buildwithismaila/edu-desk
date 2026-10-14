import { createError, defineEventHandler, getRequestHost } from 'h3'
import { useRuntimeConfig } from '#imports'
import { TENANT_ERRORS } from '../../shared/constants/tenant'
import { findTenantSchool } from '../utils/tenant'
import { resolveTenantSlug } from '../utils/tenant-host'

// Framework and asset paths carry no tenant data. `/__nuxt` covers `/__nuxt_error`, which Nuxt
// fetches internally to render error.vue, so it must pass even when the school wasn't found.
// The health check and Caddy's TLS check are called by host or IP, not on a school's subdomain.
const SKIPPED_PATH_PREFIXES = ['/_nuxt/', '/__nuxt', '/_ipx/', '/_fonts/', '/api/_nuxt_icon/', '/favicon.ico', '/api/_health', '/api/_tls/']

export default defineEventHandler(async (event) => {
  if (SKIPPED_PATH_PREFIXES.some(prefix => event.path.startsWith(prefix))) return

  const { appDomain, defaultSchoolSlug } = useRuntimeConfig(event)
  // Host header only: X-Forwarded-Host is client-controlled unless a trusted proxy sets it
  const result = resolveTenantSlug(getRequestHost(event), { appDomain, defaultSlug: defaultSchoolSlug })
  const school = result.kind === 'school' ? await findTenantSchool(result.slug) : undefined

  if (!school) throw createError(TENANT_ERRORS.notFound)
  if (school.status === 'suspended') throw createError(TENANT_ERRORS.suspended)

  event.context.school = school
})
