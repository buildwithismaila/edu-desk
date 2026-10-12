import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ROLES } from '~~/shared/constants/roles'
import type { Db } from '~~/server/utils/db'
import { assignClassTeacher, assignSubjectTeacher, createClassArm, createClassLevel, createSession, createSubject } from '../factories/academics'
import { createSchool, createTwoSchools } from '../factories/schools'
import { createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import { createTestApp } from '../helpers/app'
import { createTestDb } from '../helpers/db'

let db: Db
let app: ReturnType<typeof createTestApp>
let schoolB: Awaited<ReturnType<typeof createTwoSchools>>['schoolB']
let f: Awaited<ReturnType<typeof buildSchool>>

const hostOf = (slug: string) => `${slug}.lvh.me:3000`
type SchoolRef = { id: string, slug: string }

/** One school: JSS 1A (5 students), JSS 1B (3), SSS 1A (2), one removed student, one past-session student. */
async function buildSchool() {
  const school = await createSchool(db)
  const { session } = await createSession(db, school, { currentTerm: 'first' })
  const { session: past } = await createSession(db, school)
  const jss1 = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const sss1 = await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' })
  const arms = {
    jss1a: await createClassArm(db, school, jss1, 'A'),
    jss1b: await createClassArm(db, school, jss1, 'B'),
    sss1a: await createClassArm(db, school, sss1, 'A'),
  }
  const people: Record<string, { id: string }> = {}
  const add = async (key: string, arm: { id: string }, fields: Record<string, unknown>) => {
    const student = await createStudent(db, school, fields)
    await enrol(db, school, { student, session, arm })
    people[key] = student
  }
  await add('chidera', arms.jss1a, { firstName: 'Chidera', lastName: 'Eze', admissionNumber: 'GFA/2026/0001', gender: 'female' })
  await add('tobi', arms.jss1a, { firstName: 'Tobi', lastName: 'Adebayo', admissionNumber: 'GFA/2026/0002', gender: 'male' })
  for (let i = 0; i < 3; i++) await add(`a${i}`, arms.jss1a, { firstName: `Ann${i}`, lastName: `Zed${i}`, gender: 'female' })
  for (let i = 0; i < 3; i++) await add(`b${i}`, arms.jss1b, { firstName: `Ben${i}`, lastName: `Yak${i}`, gender: 'male' })
  for (let i = 0; i < 2; i++) await add(`s${i}`, arms.sss1a, { firstName: `Sam${i}`, lastName: `Xu${i}`, gender: 'male' })
  await add('removed', arms.jss1a, { firstName: 'Gone', lastName: 'Away', deletedAt: new Date() })
  const old = await createStudent(db, school, { firstName: 'Past', lastName: 'Student' })
  await enrol(db, school, { student: old, session: past, arm: arms.jss1b })
  people.old = old
  return { school, session, past, arms, jss1, people }
}

beforeAll(async () => {
  db = await createTestDb()
  ;({ schoolB } = await createTwoSchools(db))
  f = await buildSchool()
  await createStudent(db, schoolB, { firstName: 'Chidera', lastName: 'OtherSchool' })
})

beforeEach(() => {
  app = createTestApp(db)
})

async function loginAs(role: typeof ROLES[number], school: SchoolRef = f.school) {
  const user = await createUser(db, school, { role })
  return { user, cookie: await app.login(hostOf(school.slug), user.email, DEFAULT_TEST_PASSWORD) }
}

type List = { items: { id: string, firstName: string, lastName: string, classLabel: string | null }[], total: number, page: number, pageSize: number }
const list = async (cookie: string, query = '') =>
  (await app.request(`/api/students${query}`, { host: hostOf(f.school.slug), cookie })).json() as Promise<List>

describe('permissions', () => {
  it.each(ROLES.map(role => [role, role === 'parent' ? 403 : 200] as const))('GET /api/students as %s → %i', async (role, status) => {
    const { cookie } = await loginAs(role)
    expect((await app.request('/api/students', { host: hostOf(f.school.slug), cookie })).status).toBe(status)
  })

  it('returns 401 without a session', async () => {
    expect((await app.request('/api/students', { host: hostOf(f.school.slug) })).status).toBe(401)
  })
})

describe('GET /api/students', () => {
  it('pages through the school\'s current students sorted by surname, without removed ones', async () => {
    const { cookie } = await loginAs('admin')

    const first = await list(cookie, '?pageSize=4')
    const third = await list(cookie, '?pageSize=4&page=3')

    expect(first.total).toBe(10)
    expect(first.items.map(s => s.lastName)).toEqual(['Adebayo', 'Eze', 'Xu0', 'Xu1'])
    expect(third.items).toHaveLength(2)
    expect(third.page).toBe(3)
    const all = await list(cookie, '?pageSize=100')
    expect(all.items.map(s => s.firstName)).not.toContain('Gone')
    expect(all.items.map(s => s.lastName)).not.toContain('OtherSchool')
    expect(all.items.find(s => s.firstName === 'Chidera')!.classLabel).toBe('JSS 1A')
  })

  it.each([
    ['name', '?search=chid', ['Chidera']],
    ['full name', '?search=tobi adebayo', ['Tobi']],
    ['admission number', '?search=GFA/2026/0002', ['Tobi']],
  ])('searches by %s', async (_case, query, names) => {
    const { cookie } = await loginAs('admin')
    expect((await list(cookie, query)).items.map(s => s.firstName)).toEqual(names)
  })

  it('filters by arm, level and gender', async () => {
    const { cookie } = await loginAs('principal')

    expect((await list(cookie, `?classArmId=${f.arms.jss1b.id}`)).total).toBe(3)
    expect((await list(cookie, `?classLevelId=${f.jss1.id}`)).total).toBe(8)
    expect((await list(cookie, `?classLevelId=${f.jss1.id}&gender=female`)).total).toBe(4)
  })

  it('lists a past session\'s class with ?sessionId=', async () => {
    const { cookie } = await loginAs('admin')
    const past = await list(cookie, `?sessionId=${f.past.id}`)
    expect(past.items.map(s => s.firstName)).toEqual(['Past'])
  })

  it.each([
    ['?page=0'],
    ['?pageSize=101'],
    ['?gender=other'],
    ['?classArmId=nope'],
  ])('returns 400 for %s', async (query) => {
    const { cookie } = await loginAs('admin')
    expect((await app.request(`/api/students${query}`, { host: hostOf(f.school.slug), cookie })).status).toBe(400)
  })

  it('shows a teacher only the students of arms they teach or are class teacher of', async () => {
    const { user, cookie } = await loginAs('teacher')
    await assignClassTeacher(db, f.school, { session: f.session, arm: f.arms.jss1b, user })
    await assignSubjectTeacher(db, f.school, { session: f.session, arm: f.arms.sss1a, subject: await createSubject(db, f.school, { section: 'sss' }), user })

    const result = await list(cookie, '?pageSize=100')

    expect(result.total).toBe(5)
    expect(new Set(result.items.map(s => s.classLabel))).toEqual(new Set(['JSS 1B', 'SSS 1A']))
  })

  it('shows a teacher with no assignments nobody', async () => {
    const { cookie } = await loginAs('teacher')
    expect((await list(cookie)).total).toBe(0)
  })
})
