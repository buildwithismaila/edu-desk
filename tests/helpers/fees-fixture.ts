import type { Db } from '~~/server/utils/db'
import { createClassArm, createClassLevel, createSession } from '../factories/academics'
import { createFeeItem } from '../factories/fees'
import { createSchool } from '../factories/schools'
import { createGuardian, createStudent, enrol } from '../factories/students'
import { createUser, DEFAULT_TEST_PASSWORD } from '../factories/users'
import type { createTestApp } from './app'

export const hostOf = (slug: string) => `${slug}.lvh.me:3000`
export type FeesRole = 'admin' | 'bursar' | 'principal' | 'teacher' | 'parent'

/**
 * A school with 2025/2026 (for carry-forward) and the current 2026/2027 first term; JSS 1 (A: Ada, Bola
 * and a removed student; B: Chidi) and SSS 1 (A: Dayo); current-term fee items:
 *   JSS 1: Tuition ₦85,000 + PTA ₦2,500 (= 8,750,000 kobo), Bus ₦25,000 optional
 *   SSS 1: Tuition ₦95,000
 */
export async function feesFixture(db: Db, app: ReturnType<typeof createTestApp>) {
  const school = await createSchool(db)
  const { terms: oldTerms } = await createSession(db, school, { name: '2025/2026' })
  const { session, terms } = await createSession(db, school, { name: '2026/2027', currentTerm: 'first' })
  const term = terms.find(t => t.number === 'first')!
  const second = terms.find(t => t.number === 'second')!
  const lastThird = oldTerms.find(t => t.number === 'third')!

  const jss1 = await createClassLevel(db, school, { section: 'jss', name: 'JSS 1' })
  const sss1 = await createClassLevel(db, school, { section: 'sss', name: 'SSS 1' })
  const jss1a = await createClassArm(db, school, jss1, 'A')
  const jss1b = await createClassArm(db, school, jss1, 'B')
  const sss1a = await createClassArm(db, school, sss1, 'A')

  const parentUser = await createGuardian(db, school)
  const ada = await createStudent(db, school, { firstName: 'Ada', lastName: 'Obi', guardians: [parentUser] })
  const bola = await createStudent(db, school, { firstName: 'Bola', lastName: 'Ade' })
  const gone = await createStudent(db, school, { firstName: 'Gone', lastName: 'Away', deletedAt: new Date() })
  const chidi = await createStudent(db, school, { firstName: 'Chidi', lastName: 'Eze' })
  const dayo = await createStudent(db, school, { firstName: 'Dayo', lastName: 'Lawal' })
  for (const student of [ada, bola, gone]) await enrol(db, school, { student, session, arm: jss1a })
  await enrol(db, school, { student: chidi, session, arm: jss1b })
  await enrol(db, school, { student: dayo, session, arm: sss1a })

  const items = {
    tuition: await createFeeItem(db, school, { term, level: jss1, name: 'Tuition', amountKobo: 8_500_000 }),
    pta: await createFeeItem(db, school, { term, level: jss1, name: 'PTA', amountKobo: 250_000 }),
    bus: await createFeeItem(db, school, { term, level: jss1, name: 'Bus', amountKobo: 2_500_000, optional: true }),
    sssTuition: await createFeeItem(db, school, { term, level: sss1, name: 'Tuition', amountKobo: 9_500_000 }),
  }

  const users = {
    admin: await createUser(db, school, { role: 'admin' }),
    bursar: await createUser(db, school, { role: 'bursar', name: 'Fatima Bello' }),
    principal: await createUser(db, school, { role: 'principal' }),
    teacher: await createUser(db, school, { role: 'teacher' }),
  }
  const cookies = {} as Record<FeesRole, string>
  for (const [role, user] of Object.entries(users)) cookies[role as FeesRole] = await app.login(hostOf(school.slug), user.email!, DEFAULT_TEST_PASSWORD)
  cookies.parent = await app.login(hostOf(school.slug), parentUser.email!, DEFAULT_TEST_PASSWORD)

  return { school, session, term, second, lastThird, jss1, sss1, jss1a, jss1b, sss1a, items, students: { ada, bola, gone, chidi, dayo }, users, cookies }
}
export type FeesFixture = Awaited<ReturnType<typeof feesFixture>>

export function feesRequests(app: ReturnType<typeof createTestApp>) {
  const send = (method: string) => (f: FeesFixture, cookie: string | undefined, path: string, body?: unknown) => app.request(path, {
    host: hostOf(f.school.slug),
    cookie,
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { get: send('GET'), post: send('POST'), put: send('PUT'), patch: send('PATCH'), del: send('DELETE') }
}
