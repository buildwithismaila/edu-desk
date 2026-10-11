/** Subdomains that can never be a school (see docs/multi-tenancy.md). */
export const RESERVED_SLUGS = ['www', 'admin', 'api', 'app', 'mail', 'support', 'platform'] as const

/** Lowercase letters, digits and hyphens; 3–40 chars; no leading or trailing hyphen. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

/** Errors the tenant middleware throws. app/error.vue matches on these to pick the page it shows. */
export const TENANT_ERRORS = {
  notFound: { statusCode: 404, statusMessage: 'School not found' },
  suspended: { statusCode: 403, statusMessage: 'School suspended' },
} as const
