import { RESERVED_SLUGS, SLUG_PATTERN } from '../../shared/constants/tenant'

export type TenantSlugResult = { kind: 'school', slug: string } | { kind: 'none' }

export interface TenantHostOptions {
  /** e.g. `lvh.me` or `edudesk.ng` */
  appDomain: string
  /** School served on the bare domain / `www`; empty string means none (SaaS mode). */
  defaultSlug: string
}

const NONE: TenantSlugResult = { kind: 'none' }

/** Maps a request Host header to a school slug. Pure: does not touch the database. */
export function resolveTenantSlug(host: string | undefined, { appDomain, defaultSlug }: TenantHostOptions): TenantSlugResult {
  const hostname = (host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  const domain = appDomain.toLowerCase()
  if (!hostname || !domain) return NONE

  if (hostname === domain) return fallback(defaultSlug)
  if (!hostname.endsWith(`.${domain}`)) return NONE

  const subdomain = hostname.slice(0, -(domain.length + 1))
  if (subdomain === 'www') return fallback(defaultSlug)

  // A single label only: multi-level subdomains fail the pattern because of the dot
  if (!SLUG_PATTERN.test(subdomain) || (RESERVED_SLUGS as readonly string[]).includes(subdomain)) return NONE

  return { kind: 'school', slug: subdomain }
}

function fallback(defaultSlug: string): TenantSlugResult {
  return defaultSlug ? { kind: 'school', slug: defaultSlug } : NONE
}
