import { eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { TENANT_ERRORS } from '../../shared/constants/tenant'
import { type School, schools } from '../database/schema'
import { useDb } from './db'

/** The current school, set on `event.context.school` by server/middleware/00.tenant.ts. */
export type TenantSchool = Pick<School, 'id' | 'slug' | 'name' | 'status'>

const CACHE_TTL_MS = 30_000

// Only existing schools are cached, so random subdomains can't grow the map
const cache = new Map<string, { school: TenantSchool, expiresAt: number }>()

/** Looks up a school by slug (any status), cached for 30s. */
export async function findTenantSchool(slug: string): Promise<TenantSchool | undefined> {
  const hit = cache.get(slug)
  if (hit && hit.expiresAt > Date.now()) return hit.school

  const [school] = await useDb()
    .select({ id: schools.id, slug: schools.slug, name: schools.name, status: schools.status })
    .from(schools)
    .where(eq(schools.slug, slug))

  if (school) cache.set(slug, { school, expiresAt: Date.now() + CACHE_TTL_MS })
  else cache.delete(slug)
  return school
}

/** Tests only: forget cached schools so status changes apply immediately. */
export function clearTenantCache() {
  cache.clear()
}

/** The only sanctioned way to get the current school (and its id) in a route. */
export function requireTenant(event: H3Event): TenantSchool {
  const school = event.context.school
  if (!school) throw createError(TENANT_ERRORS.notFound)
  return school
}
