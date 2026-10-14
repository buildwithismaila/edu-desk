import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '~~/server/utils/db'
import { createSchool } from '../factories/schools'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>

beforeAll(async () => {
  db = await createTestDb()
  app = createTestApp(db)
})

describe('GET /api/_health', () => {
  it('answers ok on any host, school or not (uptime monitors call it by IP)', async () => {
    const school = await createSchool(db)
    for (const host of ['127.0.0.1:3000', 'lvh.me:3000', `${school.slug}.lvh.me:3000`]) {
      const res = await app.request('/api/_health', { host })
      expect([host, res.status]).toEqual([host, 200])
      expect(await res.json()).toEqual({ ok: true })
    }
  })
})

describe('GET /api/_tls/allowed (Caddy asks before issuing a certificate)', () => {
  // Caddy calls it inside the Docker network, as http://app:3000
  const ask = (domain?: string) => app.request(`/api/_tls/allowed${domain === undefined ? '' : `?domain=${encodeURIComponent(domain)}`}`, { host: 'app:3000' })

  it('allows existing schools (suspended ones too: their notice needs HTTPS) and the bare domain', async () => {
    const active = await createSchool(db)
    const suspended = await createSchool(db, { status: 'suspended' })
    for (const domain of [`${active.slug}.lvh.me`, `${suspended.slug}.lvh.me`, 'lvh.me', 'www.lvh.me']) {
      expect([domain, (await ask(domain)).status]).toEqual([domain, 200])
    }
  })

  it('refuses unknown or reserved subdomains and other domains', async () => {
    for (const domain of ['nobody-here.lvh.me', 'admin.lvh.me', 'a.b.lvh.me', 'example.com']) {
      expect([domain, (await ask(domain)).status]).toEqual([domain, 404])
    }
  })

  it('needs the domain', async () => {
    expect((await ask()).status).toBe(400)
  })
})
