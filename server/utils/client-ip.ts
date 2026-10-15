import { getRequestHeader, getRequestIP, type H3Event } from 'h3'

/** Which proxy is in front of the app (NUXT_TRUST_PROXY): none, Caddy (`true`), or Cloudflare (`cloudflare`). */
export type TrustProxy = boolean | 'cloudflare'

/**
 * The visitor's address for the login limiter. Behind Caddy, the first X-Forwarded-For entry (Caddy replaces any
 * value a visitor sends; decision 043). On Cloudflare, CF-Connecting-IP, which Cloudflare sets and visitors can't
 * override. With no proxy, both headers are ignored: a client could fake them.
 */
export function clientIp(event: H3Event, trust: TrustProxy): string | undefined {
  if (trust === 'cloudflare') return getRequestHeader(event, 'cf-connecting-ip') ?? getRequestIP(event)
  return getRequestIP(event, { xForwardedFor: trust === true })
}
