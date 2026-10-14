import { describe, expect, it } from 'vitest'
import { resolveTlsDomain } from '~~/server/utils/tenant-host'

const check = (domain: string) => resolveTlsDomain(domain, 'edudesk.ng')

describe('resolveTlsDomain (which hostnames may get a certificate)', () => {
  it('allows the bare domain and www', () => {
    expect(check('edudesk.ng')).toEqual({ kind: 'apex' })
    expect(check('www.edudesk.ng')).toEqual({ kind: 'apex' })
  })

  it('maps a school subdomain to its slug, ignoring case and a trailing dot', () => {
    expect(check('greenfield.edudesk.ng')).toEqual({ kind: 'school', slug: 'greenfield' })
    expect(check('GreenField.EduDesk.NG.')).toEqual({ kind: 'school', slug: 'greenfield' })
  })

  it('refuses reserved names, nested subdomains, bad slugs and other domains', () => {
    for (const domain of ['admin.edudesk.ng', 'api.edudesk.ng', 'a.b.edudesk.ng', 'x.edudesk.ng', '-bad-.edudesk.ng', 'evil.com', 'greenfield.evil.com', 'edudesk.ng.evil.com', '', 'greenfield.edudesk.ng:443']) {
      expect([domain, check(domain)]).toEqual([domain, null])
    }
  })
})
