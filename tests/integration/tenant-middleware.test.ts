import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { schools } from '~~/server/database/schema'
import { clearTenantCache } from '~~/server/utils/tenant'
import type { Db } from '~~/server/utils/db'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { resetTestRuntimeConfig, testRuntimeConfig } from '../helpers/nitro-imports'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(() => {
  app = createTestApp(db)
})

afterEach(() => {
  resetTestRuntimeConfig()
})

describe('GET /api/school', () => {
  it('returns the slug and name of the school on the host, and nothing else', async () => {
    const res = await app.request('/api/school', { host: hostOf(schoolA.slug) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: schoolA.slug, name: schoolA.name })
  })

  it('serves each school only its own identity', async () => {
    const resA = await app.request('/api/school', { host: hostOf(schoolA.slug) })
    const resB = await app.request('/api/school', { host: hostOf(schoolB.slug) })

    expect(await resA.json()).toEqual({ slug: schoolA.slug, name: schoolA.name })
    expect(await resB.json()).toEqual({ slug: schoolB.slug, name: schoolB.name })
  })

  it('ignores attempts to pick another school via query, headers or forwarded host', async () => {
    const res = await app.request(`/api/school?schoolId=${schoolB.id}&school=${schoolB.slug}`, {
      host: hostOf(schoolA.slug),
      headers: { 'x-school': schoolB.slug, 'x-school-id': schoolB.id, 'x-forwarded-host': hostOf(schoolB.slug) },
    })

    expect(await res.json()).toEqual({ slug: schoolA.slug, name: schoolA.name })
  })
})

describe('tenant middleware', () => {
  it('returns 404 "School not found" for an unknown subdomain', async () => {
    const res = await app.request('/api/school', { host: hostOf('no-such-school') })

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ statusMessage: 'School not found' })
  })

  it('blocks page requests too, not just the API', async () => {
    const res = await app.request('/', { host: hostOf('no-such-school') })
    expect(res.status).toBe(404)
  })

  it('returns 403 "School suspended" for a suspended school', async () => {
    const suspended = await createSchool(db, { status: 'suspended' })
    const res = await app.request('/api/school', { host: hostOf(suspended.slug) })

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ statusMessage: 'School suspended' })
  })

  it('returns 404 for a reserved subdomain even if a school has that slug', async () => {
    await createSchool(db, { slug: 'admin' })
    const res = await app.request('/api/school', { host: hostOf('admin') })

    expect(res.status).toBe(404)
  })

  it('returns 404 for a host outside the app domain', async () => {
    const res = await app.request('/api/school', { host: `${schoolA.slug}.example.com` })
    expect(res.status).toBe(404)
  })

  it('serves the default school on the bare domain when one is configured', async () => {
    testRuntimeConfig.defaultSchoolSlug = schoolA.slug
    const res = await app.request('/api/school', { host: 'lvh.me:3000' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: schoolA.slug, name: schoolA.name })
  })

  it('returns 404 on the bare domain without a default school', async () => {
    const res = await app.request('/api/school', { host: 'lvh.me:3000' })
    expect(res.status).toBe(404)
  })

  it.each(['/_nuxt/entry.js', '/__nuxt_error?statusCode=404', '/_fonts/inter.woff2', '/favicon.ico'])(
    'lets the framework path %s through on an unknown host',
    async (path) => {
      const res = await app.request(path, { host: hostOf('no-such-school') })

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('passed through')
    },
  )

  it('caches schools briefly and picks up status changes once the cache is cleared', async () => {
    const school = await createSchool(db)
    expect((await app.request('/api/school', { host: hostOf(school.slug) })).status).toBe(200)

    await db.update(schools).set({ status: 'suspended' }).where(eq(schools.id, school.id))
    expect((await app.request('/api/school', { host: hostOf(school.slug) })).status).toBe(200)

    clearTenantCache()
    expect((await app.request('/api/school', { host: hostOf(school.slug) })).status).toBe(403)
  })
})
