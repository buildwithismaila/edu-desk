import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_GRADE_BANDS } from '~~/shared/constants/academics'
import { ROLES } from '~~/shared/constants/roles'
import { assessmentComponents, gradeBands } from '~~/server/database/schema'
import { applySchoolDefaults } from '~~/server/services/school-defaults'
import type { Db } from '~~/server/utils/db'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']

const hostOf = (slug: string) => `${slug}.lvh.me:3000`

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolB } = await createTwoSchools(db))
  await applySchoolDefaults(db, schoolB.id)
})

beforeEach(() => {
  app = createTestApp(db)
})

/** A fresh school with the domain defaults, so each test starts from a known state. */
async function freshSchool() {
  const school = await createSchool(db)
  await applySchoolDefaults(db, school.id)
  return school
}

async function loginAs(role: typeof ROLES[number], school: { id: string, slug: string }) {
  const user = await createUser(db, school, { role })
  return app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD)
}

function call(method: string, path: string, cookie: string | undefined, slug: string, body?: unknown) {
  return app.request(path, {
    host: hostOf(slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

const SPLIT_4 = [{ name: 'CA1', maxScore: 10 }, { name: 'CA2', maxScore: 10 }, { name: 'Project', maxScore: 20 }, { name: 'Exam', maxScore: 60 }]
const PASS_FAIL = [{ grade: 'P', minScore: 50, maxScore: 100, remark: 'Pass' }, { grade: 'F', minScore: 0, maxScore: 49, remark: 'Fail' }]

describe('permissions', () => {
  it.each(ROLES.flatMap(role => ['/api/assessment-components', '/api/grading-scales'].map(path => [path, role, role === 'parent' ? 403 : 200] as const)))(
    'GET %s as %s → %i',
    async (path, role, status) => {
      const school = await freshSchool()
      expect((await call('GET', path, await loginAs(role, school), school.slug)).status).toBe(status)
    },
  )

  it.each(ROLES.map(role => [role, role === 'admin' ? 200 : 403] as const))('PUT /api/assessment-components as %s → %i', async (role, status) => {
    const school = await freshSchool()
    expect((await call('PUT', '/api/assessment-components', await loginAs(role, school), school.slug, { components: SPLIT_4 })).status).toBe(status)
  })

  it.each(ROLES.map(role => [role, role === 'admin' ? 200 : 403] as const))('PUT /api/grading-scales/jss as %s → %i', async (role, status) => {
    const school = await freshSchool()
    expect((await call('PUT', '/api/grading-scales/jss', await loginAs(role, school), school.slug, { bands: PASS_FAIL })).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    const school = await freshSchool()
    expect((await call('GET', '/api/grading-scales', undefined, school.slug)).status).toBe(401)
    expect((await call('PUT', '/api/assessment-components', undefined, school.slug, { components: SPLIT_4 })).status).toBe(401)
  })
})

describe('assessment components', () => {
  it('returns the school\'s split in order', async () => {
    const school = await freshSchool()
    const body = await (await call('GET', '/api/assessment-components', await loginAs('teacher', school), school.slug)).json()

    expect(body.map((c: { name: string, maxScore: number }) => [c.name, c.maxScore])).toEqual([['CA1', 20], ['CA2', 20], ['Exam', 60]])
  })

  it('replaces the split', async () => {
    const school = await freshSchool()
    const admin = await loginAs('admin', school)

    const res = await call('PUT', '/api/assessment-components', admin, school.slug, { components: SPLIT_4 })

    expect(res.status).toBe(200)
    expect((await res.json()).map((c: { name: string }) => c.name)).toEqual(['CA1', 'CA2', 'Project', 'Exam'])
    const rows = await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, school.id))
    expect(rows).toHaveLength(4)
  })

  it.each([
    ['a total that is not 100', [{ name: 'CA', maxScore: 30 }, { name: 'Exam', maxScore: 60 }], 'Total is 90; it must be 100'],
    ['duplicate names', [{ name: 'Exam', maxScore: 40 }, { name: 'exam', maxScore: 60 }], 'Each component needs a different name'],
    ['no components', [], 'Add at least one component'],
  ])('rejects %s with 400, keeping the old split', async (_case, components, message) => {
    const school = await freshSchool()
    const before = await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, school.id))

    const res = await call('PUT', '/api/assessment-components', await loginAs('admin', school), school.slug, { components })

    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.components).toContain(message)
    expect(await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, school.id))).toEqual(before)
  })

  it('only changes the host school\'s split', async () => {
    const school = await freshSchool()
    const before = await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolB.id))

    await call('PUT', '/api/assessment-components', await loginAs('admin', school), school.slug, { components: SPLIT_4, schoolId: schoolB.id })

    expect(await db.select().from(assessmentComponents).where(eq(assessmentComponents.schoolId, schoolB.id))).toEqual(before)
  })
})

describe('grading scales', () => {
  it('returns the school\'s scales for primary, JSS and SSS, highest band first', async () => {
    const school = await freshSchool()
    const body = await (await call('GET', '/api/grading-scales', await loginAs('principal', school), school.slug)).json()

    expect(Object.keys(body).sort()).toEqual(['jss', 'primary', 'sss'])
    expect(body.sss.map((b: { grade: string }) => b.grade)).toEqual(DEFAULT_GRADE_BANDS.sss.map(b => b.grade))
    expect(body.primary[0]).toMatchObject({ grade: 'A', minScore: 70, maxScore: 100, remark: 'Excellent' })
  })

  it('replaces one section\'s scale, leaving the others', async () => {
    const school = await freshSchool()

    const res = await call('PUT', '/api/grading-scales/jss', await loginAs('admin', school), school.slug, { bands: [...PASS_FAIL].reverse() })

    expect(res.status).toBe(200)
    expect((await res.json()).map((b: { grade: string }) => b.grade)).toEqual(['P', 'F'])
    const rows = await db.select().from(gradeBands).where(eq(gradeBands.schoolId, school.id))
    expect(rows.filter(b => b.section === 'jss')).toHaveLength(2)
    expect(rows.filter(b => b.section === 'primary')).toHaveLength(DEFAULT_GRADE_BANDS.primary.length)
  })

  it.each([
    ['a gap', [{ grade: 'P', minScore: 51, maxScore: 100, remark: '' }, { grade: 'F', minScore: 0, maxScore: 49, remark: '' }], 'Gap between 49 and 51: score 50 has no grade'],
    ['an overlap', [{ grade: 'P', minScore: 49, maxScore: 100, remark: '' }, { grade: 'F', minScore: 0, maxScore: 49, remark: '' }], 'F (0–49) overlaps P (49–100)'],
    ['not reaching 100', [{ grade: 'P', minScore: 50, maxScore: 99, remark: '' }, { grade: 'F', minScore: 0, maxScore: 49, remark: '' }], 'The highest band must end at 100'],
  ])('rejects a scale with %s, keeping the old one', async (_case, bands, message) => {
    const school = await freshSchool()
    const before = await db.select().from(gradeBands).where(eq(gradeBands.schoolId, school.id))

    const res = await call('PUT', '/api/grading-scales/sss', await loginAs('admin', school), school.slug, { bands })

    expect(res.status).toBe(400)
    expect((await res.json()).data.fieldErrors.bands).toEqual([message])
    expect(await db.select().from(gradeBands).where(eq(gradeBands.schoolId, school.id))).toEqual(before)
  })

  it.each(['nursery', 'university'])('returns 400 for section %s', async (section) => {
    const school = await freshSchool()
    expect((await call('PUT', `/api/grading-scales/${section}`, await loginAs('admin', school), school.slug, { bands: PASS_FAIL })).status).toBe(400)
  })

  it('only changes the host school\'s scale', async () => {
    const school = await freshSchool()
    const before = await db.select().from(gradeBands).where(eq(gradeBands.schoolId, schoolB.id))

    await call('PUT', '/api/grading-scales/sss', await loginAs('admin', school), school.slug, { bands: PASS_FAIL })

    expect(await db.select().from(gradeBands).where(eq(gradeBands.schoolId, schoolB.id))).toEqual(before)
  })
})
