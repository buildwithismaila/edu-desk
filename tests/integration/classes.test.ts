import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import { classArms, classLevels } from '~~/server/database/schema'
import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolA: Awaited<ReturnType<typeof createTwoSchools>>['schoolA']
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']
let adminA: string

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

let n = 0
const unique = (prefix: string) => `${prefix} ${++n}`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolA, schoolB } = await createTwoSchools(db))
})

beforeEach(async () => {
  app = createTestApp(db)
  adminA = await loginAs('admin')
})

async function loginAs(role: typeof ROLES[number], school: { id: string, slug: string } = schoolA) {
  const user = await createUser(db, school, { role })
  return app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD)
}

function call(method: string, path: string, cookie: string | undefined, body?: unknown, slug = schoolA.slug) {
  return app.request(path, {
    host: hostOf(slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

describe('permissions', () => {
  /** Fresh records per test: a level with an arm, and a level without arms (deletable). */
  type Fixture = { level: string, emptyLevel: string, arm: string }
  const writes: { route: string, path: (f: Fixture) => string, body?: () => unknown, ok: number }[] = [
    { route: 'POST /api/class-levels', path: () => '/api/class-levels', body: () => ({ section: 'jss', name: unique('Route level') }), ok: 201 },
    { route: 'PATCH /api/class-levels/:id', path: f => `/api/class-levels/${f.level}`, body: () => ({ name: unique('Route level') }), ok: 200 },
    { route: 'DELETE /api/class-levels/:id', path: f => `/api/class-levels/${f.emptyLevel}`, ok: 200 },
    { route: 'POST /api/class-levels/:id/arms', path: f => `/api/class-levels/${f.level}/arms`, body: () => ({ name: unique('Route arm') }), ok: 201 },
    { route: 'PATCH /api/class-arms/:id', path: f => `/api/class-arms/${f.arm}`, body: () => ({ name: unique('Route arm') }), ok: 200 },
    { route: 'DELETE /api/class-arms/:id', path: f => `/api/class-arms/${f.arm}`, ok: 200 },
  ]

  it.each(ROLES.map(r => [r, r === 'parent' ? 403 : 200] as const))('GET /api/class-levels as %s → %i', async (role, status) => {
    expect((await call('GET', '/api/class-levels', await loginAs(role))).status).toBe(status)
  })

  it.each(ROLES.flatMap(role => writes.map(w => [w.route, role, w, role === 'admin' ? w.ok : 403] as const)))(
    '%s as %s',
    async (route, role, write, status) => {
      const level = await createClassLevel(db, schoolA)
      const fixture = {
        level: level.id,
        emptyLevel: (await createClassLevel(db, schoolA)).id,
        arm: (await createClassArm(db, schoolA, level)).id,
      }

      const res = await call(route.split(' ')[0]!, write.path(fixture), await loginAs(role), write.body?.())
      expect(res.status).toBe(status)
    },
  )

  it('PUT /api/class-levels/order: admin only', async () => {
    const school = await createSchool(db)
    const level = await createClassLevel(db, school)
    const teacher = await loginAs('teacher', school)
    const admin = await loginAs('admin', school)

    expect((await call('PUT', '/api/class-levels/order', teacher, { ids: [level.id] }, school.slug)).status).toBe(403)
    expect((await call('PUT', '/api/class-levels/order', admin, { ids: [level.id] }, school.slug)).status).toBe(200)
  })

  it('returns 401 without a session', async () => {
    expect((await call('GET', '/api/class-levels', undefined)).status).toBe(401)
    expect((await call('POST', '/api/class-levels', undefined, { section: 'jss', name: 'X' })).status).toBe(401)
  })
})

describe('class levels', () => {
  it('lists only the school\'s levels, by section then order, with labelled arms', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const sss = await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' })
    const jss = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
    await createClassArm(db, school, jss, 'B')
    await createClassArm(db, school, jss, 'A')
    await createClassArm(db, school, jss, 'Gold')
    await createClassLevel(db, schoolB, { name: unique('Other school level') })

    const body = await (await call('GET', '/api/class-levels', admin, undefined, school.slug)).json() as { id: string, arms: { name: string, label: string }[] }[]

    expect(body.map(l => l.id)).toEqual([jss.id, sss.id])
    expect(body[0]!.arms.map(a => a.label)).toEqual(['JSS 1A', 'JSS 1B', 'JSS 1 Gold'])
  })

  it('adds a level at the end of its section', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    await call('POST', '/api/class-levels', admin, { section: 'jss', name: 'JSS 1' }, school.slug)
    await call('POST', '/api/class-levels', admin, { section: 'primary', name: 'Primary 1' }, school.slug)

    const res = await call('POST', '/api/class-levels', admin, { section: 'jss', name: ' JSS 2 ' }, school.slug)

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ section: 'jss', name: 'JSS 2', arms: [] })
    const body = await (await call('GET', '/api/class-levels', admin, undefined, school.slug)).json() as { name: string }[]
    expect(body.map(l => l.name)).toEqual(['Primary 1', 'JSS 1', 'JSS 2'])
  })

  it('rejects a duplicate level name, ignoring case', async () => {
    const name = unique('Route level')
    await call('POST', '/api/class-levels', adminA, { section: 'jss', name })

    expect((await call('POST', '/api/class-levels', adminA, { section: 'sss', name: name.toUpperCase() })).status).toBe(409)
  })

  it('returns 400 for an unknown section or empty name', async () => {
    const res = await call('POST', '/api/class-levels', adminA, { section: 'university', name: '' })
    expect(res.status).toBe(400)
    expect(Object.keys((await res.json()).data.fieldErrors).sort()).toEqual(['name', 'section'])
  })

  it('renames a level, with duplicate and cross-tenant checks', async () => {
    const level = await createClassLevel(db, schoolA)
    const other = await createClassLevel(db, schoolA)
    const theirs = await createClassLevel(db, schoolB)
    const name = unique('Renamed')

    expect((await call('PATCH', `/api/class-levels/${level.id}`, adminA, { name })).status).toBe(200)
    expect((await call('PATCH', `/api/class-levels/${other.id}`, adminA, { name })).status).toBe(409)
    expect((await call('PATCH', `/api/class-levels/${theirs.id}`, adminA, { name: unique('X') })).status).toBe(404)

    const [b] = await db.select().from(classLevels).where(eq(classLevels.id, theirs.id))
    expect(b!.name).toBe(theirs.name)
  })

  it('reorders the school\'s levels', async () => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const one = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
    const two = await createClassLevel(db, school, { section: 'jss', name: 'JSS 2' })
    const three = await createClassLevel(db, school, { section: 'jss', name: 'JSS 3' })

    const res = await call('PUT', '/api/class-levels/order', admin, { ids: [three.id, one.id, two.id] }, school.slug)

    expect(res.status).toBe(200)
    expect((await res.json() as { name: string }[]).map(l => l.name)).toEqual(['JSS 3', 'JSS 1', 'JSS 2'])
  })

  it.each([
    ['a missing level', (ids: string[], _foreign: string) => ids.slice(1)],
    ['another school\'s level', (ids: string[], foreign: string) => [...ids, foreign]],
    ['a repeated level', (ids: string[], _foreign: string) => [...ids, ids[0]!]],
  ])('rejects an order with %s, changing nothing', async (_case, build) => {
    const school = await createSchool(db)
    const admin = await loginAs('admin', school)
    const levels = [await createClassLevel(db, school), await createClassLevel(db, school)]
    const foreign = await createClassLevel(db, schoolB)
    const before = await db.select().from(classLevels).where(eq(classLevels.schoolId, school.id))

    const res = await call('PUT', '/api/class-levels/order', admin, { ids: build(levels.map(l => l.id), foreign.id) }, school.slug)

    expect(res.status).toBe(400)
    expect(await db.select().from(classLevels).where(eq(classLevels.schoolId, school.id))).toEqual(before)
  })

  it('deletes a level without arms, refuses one with arms', async () => {
    const empty = await createClassLevel(db, schoolA)
    const withArms = await createClassLevel(db, schoolA)
    await createClassArm(db, schoolA, withArms)

    expect((await call('DELETE', `/api/class-levels/${empty.id}`, adminA)).status).toBe(200)
    const res = await call('DELETE', `/api/class-levels/${withArms.id}`, adminA)
    expect(res.status).toBe(409)
    expect((await res.json()).message).toMatch(/arms/)
    expect(await db.select().from(classLevels).where(eq(classLevels.id, withArms.id))).toHaveLength(1)
  })

  it('returns 404 when deleting another school\'s level', async () => {
    const theirs = await createClassLevel(db, schoolB)
    expect((await call('DELETE', `/api/class-levels/${theirs.id}`, adminA)).status).toBe(404)
    expect(await db.select().from(classLevels).where(eq(classLevels.id, theirs.id))).toHaveLength(1)
  })
})

describe('class arms', () => {
  it('adds an arm to a level, with its label', async () => {
    const level = await createClassLevel(db, schoolA, { name: unique('JSS') })

    const res = await call('POST', `/api/class-levels/${level.id}/arms`, adminA, { name: ' C ' })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ name: 'C', classLevelId: level.id, label: `${level.name}C` })
  })

  it('rejects a duplicate arm in the same level (ignoring case), allows it in another', async () => {
    const level = await createClassLevel(db, schoolA)
    const other = await createClassLevel(db, schoolA)
    await createClassArm(db, schoolA, level, 'Gold')

    expect((await call('POST', `/api/class-levels/${level.id}/arms`, adminA, { name: 'gold' })).status).toBe(409)
    expect((await call('POST', `/api/class-levels/${other.id}/arms`, adminA, { name: 'Gold' })).status).toBe(201)
  })

  it('returns 404 when adding an arm to another school\'s level', async () => {
    const theirs = await createClassLevel(db, schoolB)
    expect((await call('POST', `/api/class-levels/${theirs.id}/arms`, adminA, { name: 'A' })).status).toBe(404)
    expect(await db.select().from(classArms).where(eq(classArms.classLevelId, theirs.id))).toEqual([])
  })

  it('renames an arm, with duplicate and cross-tenant checks', async () => {
    const level = await createClassLevel(db, schoolA)
    const arm = await createClassArm(db, schoolA, level, 'A')
    await createClassArm(db, schoolA, level, 'B')
    const theirs = await createClassArm(db, schoolB, await createClassLevel(db, schoolB), 'A')

    expect((await call('PATCH', `/api/class-arms/${arm.id}`, adminA, { name: 'Diamond' })).status).toBe(200)
    expect((await call('PATCH', `/api/class-arms/${arm.id}`, adminA, { name: 'b' })).status).toBe(409)
    expect((await call('PATCH', `/api/class-arms/${theirs.id}`, adminA, { name: 'Z' })).status).toBe(404)
    const [b] = await db.select().from(classArms).where(eq(classArms.id, theirs.id))
    expect(b!.name).toBe('A')
  })

  it('deletes an arm; another school\'s arm is 404 and kept', async () => {
    const arm = await createClassArm(db, schoolA, await createClassLevel(db, schoolA))
    const theirs = await createClassArm(db, schoolB, await createClassLevel(db, schoolB))

    expect((await call('DELETE', `/api/class-arms/${arm.id}`, adminA)).status).toBe(200)
    expect((await call('DELETE', `/api/class-arms/${theirs.id}`, adminA)).status).toBe(404)
    expect(await db.select().from(classArms).where(eq(classArms.id, theirs.id))).toHaveLength(1)
  })

  it('returns 400 for an empty or overlong arm name', async () => {
    const level = await createClassLevel(db, schoolA)
    expect((await call('POST', `/api/class-levels/${level.id}/arms`, adminA, { name: '  ' })).status).toBe(400)
    expect((await call('POST', `/api/class-levels/${level.id}/arms`, adminA, { name: 'x'.repeat(21) })).status).toBe(400)
  })
})
