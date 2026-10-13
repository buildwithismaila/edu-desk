import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { defaultAdmissionPrefix } from '~~/shared/utils/admission-number'
import { schools } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'
import { resetTestStorage, testStorageKeys } from '../helpers/nitro-imports'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
const onA = (cookie?: string) => ({ host: hostOf(schoolA.slug), cookie })

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 5, 6, 7, 8])
const GIF = new TextEncoder().encode('GIF89a-not-allowed')

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(async () => {
  app = createTestApp(db)
  resetTestStorage()
  await db.update(schools).set({ logoKey: null, logoUpdatedAt: null, address: null, motto: null, phone: null, email: null, showPositions: true, showFeesOnReportCard: false, admissionPrefix: null })
})

async function loginAs(role: typeof ROLES[number], school = schoolA) {
  const user = await createUser(db, school, { role })
  return app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD)
}

function uploadLogo(cookie: string | undefined, bytes: Uint8Array, { field = 'logo', slug = schoolA.slug } = {}) {
  const form = new FormData()
  form.append(field, new Blob([bytes as BlobPart]), 'logo.bin')
  return app.request('/api/school/logo', { host: hostOf(slug), cookie, method: 'PUT', body: form })
}

const patchProfile = (cookie: string | undefined, body: unknown, slug = schoolA.slug) =>
  app.request('/api/school/profile', { host: hostOf(slug), cookie, method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('permissions', () => {
  const staff = (role: string) => role !== 'parent'

  it.each(ROLES.map(r => [r, staff(r) ? 200 : 403] as const))('GET /api/school/profile as %s → %i', async (role, status) => {
    expect((await app.request('/api/school/profile', onA(await loginAs(role)))).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, r === 'admin' ? 200 : 403] as const))('PATCH /api/school/profile as %s → %i', async (role, status) => {
    expect((await patchProfile(await loginAs(role), { motto: 'Excellence' })).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, r === 'admin' ? 200 : 403] as const))('PUT /api/school/logo as %s → %i', async (role, status) => {
    expect((await uploadLogo(await loginAs(role), PNG)).status).toBe(status)
  })

  it.each(ROLES.map(r => [r, r === 'admin' ? 200 : 403] as const))('DELETE /api/school/logo as %s → %i', async (role, status) => {
    expect((await app.request('/api/school/logo', { ...onA(await loginAs(role)), method: 'DELETE' })).status).toBe(status)
  })

  it.each([
    ['GET', '/api/school/profile'],
    ['PATCH', '/api/school/profile'],
    ['PUT', '/api/school/logo'],
    ['DELETE', '/api/school/logo'],
  ])('%s %s without a session → 401', async (method, path) => {
    expect((await app.request(path, { ...onA(), method })).status).toBe(401)
  })
})

describe('school profile', () => {
  it('returns the profile', async () => {
    const res = await app.request('/api/school/profile', onA(await loginAs('teacher')))

    expect(await res.json()).toEqual({
      name: schoolA.name, address: null, motto: null, phone: null, email: null, logoUrl: null, showPositions: true, showFeesOnReportCard: false,
      admissionPrefix: defaultAdmissionPrefix(schoolA.name),
    })
  })

  it('updates only the given fields, normalising the phone and clearing empty text', async () => {
    const cookie = await loginAs('admin')
    await patchProfile(cookie, { address: '1 Broad Street, Lagos', motto: 'Excellence' })

    const res = await patchProfile(cookie, { phone: '0803 123 4567', email: 'Office@School.test', motto: '  ', showPositions: false })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      address: '1 Broad Street, Lagos', motto: null, phone: '+2348031234567', email: 'Office@School.test', showPositions: false,
    })
  })

  it('returns 400 with field errors for invalid values', async () => {
    const res = await patchProfile(await loginAs('admin'), { phone: '12345', email: 'nope', name: '' })

    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors).sort()).toEqual(['email', 'name', 'phone'])
  })

  it('sets the admission number prefix, uppercased', async () => {
    const res = await patchProfile(await loginAs('admin'), { admissionPrefix: ' gfa ' })

    expect(res.status).toBe(200)
    expect((await res.json()).admissionPrefix).toBe('GFA')
    const [a] = await db.select().from(schools).where(eq(schools.id, schoolA.id))
    expect(a!.admissionPrefix).toBe('GFA')
  })

  it.each(['G', 'GREENFA', 'GF-A', ''])('rejects the admission prefix %j', async (prefix) => {
    const res = await patchProfile(await loginAs('admin'), { admissionPrefix: prefix })

    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.admissionPrefix).toEqual(['Use 2–6 letters or digits, e.g. GFA'])
  })

  it('shows a new school name immediately, despite the tenant cache', async () => {
    const cookie = await loginAs('admin')
    expect((await (await app.request('/api/school', onA())).json()).name).toBe(schoolA.name)

    await patchProfile(cookie, { name: 'Renamed Academy' })

    expect((await (await app.request('/api/school', onA())).json()).name).toBe('Renamed Academy')
    await patchProfile(cookie, { name: schoolA.name })
  })

  it('only changes the host\'s school, even if the body names another', async () => {
    await patchProfile(await loginAs('admin'), { motto: 'Only A', schoolId: schoolB.id, id: schoolB.id })

    const [b] = await db.select().from(schools).where(eq(schools.id, schoolB.id))
    const [a] = await db.select().from(schools).where(eq(schools.id, schoolA.id))
    expect(b!.motto).toBeNull()
    expect(a!.motto).toBe('Only A')
  })
})

describe('logo', () => {
  it('uploads, exposes and serves the logo', async () => {
    const res = await uploadLogo(await loginAs('admin'), PNG)
    expect(res.status).toBe(200)
    const { logoUrl } = await res.json() as { logoUrl: string }
    expect(logoUrl).toMatch(/^\/api\/school\/logo\?v=\d+$/)

    expect(await (await app.request('/api/school', onA())).json()).toEqual({ slug: schoolA.slug, name: schoolA.name, logoUrl })

    const logo = await app.request(logoUrl, onA())
    expect(logo.status).toBe(200)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect(logo.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(new Uint8Array(await logo.arrayBuffer())).toEqual(PNG)
  })

  it('stores the logo under the host school\'s id only', async () => {
    await uploadLogo(await loginAs('admin'), PNG)
    expect(testStorageKeys()).toEqual([`uploads:schools:${schoolA.id}:logo.png`])
  })

  it('replaces the logo, removing the old file', async () => {
    const cookie = await loginAs('admin')
    await uploadLogo(cookie, PNG)

    await uploadLogo(cookie, JPEG)

    expect(testStorageKeys()).toEqual([`uploads:schools:${schoolA.id}:logo.jpeg`])
    const logo = await app.request('/api/school/logo', onA())
    expect(logo.headers.get('content-type')).toBe('image/jpeg')
  })

  it('never serves one school\'s logo on another school\'s host', async () => {
    await uploadLogo(await loginAs('admin'), PNG)

    expect((await app.request('/api/school/logo', { host: hostOf(schoolB.slug) })).status).toBe(404)
    expect((await (await app.request('/api/school', { host: hostOf(schoolB.slug) })).json()).logoUrl).toBeNull()
  })

  it('rejects a file that is not PNG, JPEG or WebP, whatever its name', async () => {
    const res = await uploadLogo(await loginAs('admin'), GIF)

    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.logo).toEqual(['Upload a PNG, JPEG or WebP image'])
    expect(testStorageKeys()).toEqual([])
  })

  it('rejects a file over 1 MB', async () => {
    const big = new Uint8Array(1024 * 1024 + 1)
    big.set(PNG)

    const res = await uploadLogo(await loginAs('admin'), big)

    expect(res.status).toBe(413)
    expect(testStorageKeys()).toEqual([])
  })

  it('returns 400 when the logo field is missing', async () => {
    expect((await uploadLogo(await loginAs('admin'), PNG, { field: 'picture' })).status).toBe(400)
  })

  it('deletes the logo', async () => {
    const cookie = await loginAs('admin')
    await uploadLogo(cookie, PNG)

    expect((await app.request('/api/school/logo', { ...onA(cookie), method: 'DELETE' })).status).toBe(200)

    expect(testStorageKeys()).toEqual([])
    expect((await app.request('/api/school/logo', onA())).status).toBe(404)
    expect((await (await app.request('/api/school', onA())).json()).logoUrl).toBeNull()
  })
})
